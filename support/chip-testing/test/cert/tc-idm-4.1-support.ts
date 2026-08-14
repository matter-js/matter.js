/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, MatterError, Millis, Time } from "@matter/main";
import type { AttributePathSpec, CertNodeRef, CertStepContext } from "@matter/testing";
import {
    ACK_WAIT_TIMEOUT_MS,
    expectMessageWithPath,
    expectReportAck,
    expectSubscriptionId,
    SUBSCRIBE_REQUEST_MESSAGE,
} from "./tc-support.js";

// TC-IDM-4.1's subscription machinery lives beside the test case rather than inside it because a
// `TC-*.test.ts` registers its own device-driven mocha test at import time, so the cert-framework
// spec set cannot import one to unit-test what it declares.

/** A check inside a TC-IDM-4.1 step failed; the evidence record carrying the detail is already recorded. */
export class CertCheckFailedError extends MatterError {}

// The subscriber's own choice of negotiated interval — matches Test_TC_IDM_4_1.yaml's own step-1
// capture (MinIntervalFloorSeconds=0xa, MaxIntervalCeilingSeconds=0x50) and is reused for every
// subscription in this TC; the plan does not mandate a different interval per step.
export const MIN_INTERVAL_FLOOR_SECONDS = 10;
export const MAX_INTERVAL_CEILING_SECONDS = 80;

// ServerSubscription's #prepareDataUpdate (packages/node/src/node/server/ServerSubscription.ts)
// enforces MinIntervalFloor as a real per-report debounce: a change landing before the floor has
// elapsed since the last report is coalesced into the next one, not reported on its own. Each write
// in subscribeAndModify waits for its own report before the next write is issued, so this bounds
// that wait (floor plus slack for scheduling/CI jitter), not the write itself.
const REPORT_WAIT_TIMEOUT_MS = (MIN_INTERVAL_FLOOR_SECONDS + 20) * 1000;

/**
 * Waits until `satisfied()` holds or `timeoutMs` elapses, woken by `setNotify`'s callback rather than
 * polling. A wake that leaves `satisfied()` false waits again on the remaining budget, so a report
 * that isn't the awaited one can wake this without ending it, and no timer outlives the wait.
 */
async function waitForReport(
    satisfied: () => boolean,
    setNotify: (fn: (() => void) | undefined) => void,
    timeoutMs: number,
): Promise<boolean> {
    const deadline = Time.nowMs + timeoutMs;
    while (!satisfied()) {
        const remaining = deadline - Time.nowMs;
        if (remaining <= 0) {
            return false;
        }
        const notified = new Promise<void>(resolve => setNotify(resolve));
        const timeout = Time.sleep("TC-IDM-4.1 subscription update wait", Millis(remaining));
        try {
            await Promise.race([notified, timeout]);
        } finally {
            setNotify(undefined);
            timeout.cancel();
        }
    }
    return true;
}

/** Per-wait budgets {@link subscribeAndModify} uses; a test supplies shorter ones than a real run needs. */
export interface SubscribeAndModifyTimeouts {
    /** Bounds each establishment check (SubscribeRequest shape, subscription id, priming-report ack). */
    establishMs?: number;
    /** Bounds the wait for one write's own report; must cover MinIntervalFloor's debounce. */
    reportMs?: number;
}

/**
 * Subscribes to `path`, verifies the SubscribeRequestMessage/AttributePathIB log shape, then writes
 * each of `values` in turn — waiting for that write's own subscription report before issuing the
 * next write. Firing every write first and only then waiting would let MinIntervalFloor coalesce two
 * writes landing inside the same floor window into a single report, so this pacing is what makes
 * "N writes -> N reports" hold, not an incidental choice.
 *
 * A write is confirmed by the report carrying *this* subscription's id in the TH's log, logged after
 * the write and after the previous write's own ack (see {@link expectReportAck}). The callback seam
 * cannot serve as that confirmation: a controller holding several subscriptions to one path delivers
 * one callback per subscription per change, and chip-tool's report JSON carries no subscription id to
 * tell them apart. Each window therefore opens on a specific, already-observed log event rather than a
 * bare mark taken after subscribe() — subscribe() resolving only means the client has sent the priming
 * ack, not that this log has decoded it yet.
 *
 * `onUpdate` asserts values rather than arrival counts: `values` must come back as an in-order
 * subsequence of what it delivers, so a duplicate or keepalive report is an extra element of that
 * sequence and never the next write's confirmation, while a value this step never wrote is a mismatch.
 * A flavor whose log carries no subscription id (matterjs) has nothing to correlate on, so there that
 * subsequence is also what confirms each write.
 *
 * What the log confirmation does not prove: that the report it matched carried this write's data
 * rather than being a keepalive on the same subscription. Conversely a report the controller drops
 * before `onUpdate` fails the value assertion even though the interaction itself succeeded.
 */
export async function subscribeAndModify<Value>(
    cx: CertStepContext,
    ref: CertNodeRef,
    step: number,
    path: AttributePathSpec,
    values: Value[],
    timeouts: SubscribeAndModifyTimeouts = {},
): Promise<void> {
    const th = cx.devices.th;
    const node = cx.controllers.dut.node(ref);
    const establishMs = timeouts.establishMs ?? ACK_WAIT_TIMEOUT_MS;
    const reportMs = timeouts.reportMs ?? REPORT_WAIT_TIMEOUT_MS;
    const from = th.log.mark();

    const failResponse = (detail: string): never => {
        cx.recorder.check({ type: "response", verdict: "fail", detail });
        throw new CertCheckFailedError(detail);
    };

    const reported = new Array<unknown>();
    let matched = 0;
    let mismatch: string | undefined;
    let notify: (() => void) | undefined;
    await node.subscribe(path, {
        minIntervalFloorSeconds: MIN_INTERVAL_FLOOR_SECONDS,
        maxIntervalCeilingSeconds: MAX_INTERVAL_CEILING_SECONDS,
        onUpdate: value => {
            reported.push(value);
            if (matched < values.length && values[matched] === value) {
                matched++;
            } else if (mismatch === undefined && !values.some(written => written === value)) {
                mismatch =
                    `report ${reported.length} carried ${JSON.stringify(value)}, which is none of the values ` +
                    `this step wrote (${JSON.stringify(values)})`;
            }
            notify?.();
        },
    });

    const subscribeCheck = await expectMessageWithPath(
        th.log,
        th.flavor,
        SUBSCRIBE_REQUEST_MESSAGE,
        path,
        from,
        establishMs,
    );
    cx.recorder.check(subscribeCheck);
    if (subscribeCheck.verdict === "fail") {
        throw new CertCheckFailedError(
            `SubscribeRequestMessage log check failed for step ${step}: ${JSON.stringify(subscribeCheck)}`,
        );
    }

    // The follower pumps the device stream asynchronously, so a previous step's SubscribeResponse
    // can surface after this step marked — reading the id out of that one pins every later check to
    // the wrong subscription.
    const established = subscribeCheck.logLine !== undefined ? subscribeCheck.logLine + 1 : from;

    const idLookup = await expectSubscriptionId(th.log, th.flavor, established, establishMs);
    cx.recorder.check(idLookup.check);
    if (idLookup.check.verdict === "fail") {
        throw new CertCheckFailedError(
            `Subscription-id lookup failed for step ${step}: ${JSON.stringify(idLookup.check)}`,
        );
    }

    const primingAckCheck = await expectReportAck(th.log, th.flavor, idLookup.subscriptionId, established, establishMs);
    cx.recorder.check(primingAckCheck);
    if (primingAckCheck.verdict === "fail") {
        throw new CertCheckFailedError(
            `Priming-report status check failed for step ${step}: ${JSON.stringify(primingAckCheck)}`,
        );
    }

    let ackCursor = primingAckCheck.logLine !== undefined ? primingAckCheck.logLine + 1 : th.log.mark();
    let logConfirmed = 0;
    for (let i = 0; i < values.length; i++) {
        // A report already in the log when the write was issued cannot be this write's — a further
        // chunk of the priming report, or a keepalive on this same subscription, would otherwise
        // confirm a write whose own report never arrived.
        const writeFrom = th.log.mark();
        try {
            await node.writeAttribute(path, values[i]);
        } catch (e) {
            cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
            throw e;
        }

        const ackCheck = await expectReportAck(
            th.log,
            th.flavor,
            idLookup.subscriptionId,
            Math.max(ackCursor, writeFrom),
            reportMs,
        );
        cx.recorder.check(ackCheck);
        if (ackCheck.verdict === "fail") {
            throw new CertCheckFailedError(
                `StatusResponse ack check failed for step ${step}, write ${i + 1}/${values.length}: ${JSON.stringify(ackCheck)}`,
            );
        }
        if (ackCheck.verdict === "pass") {
            logConfirmed++;
            if (ackCheck.logLine !== undefined) {
                ackCursor = ackCheck.logLine + 1;
            }
        } else {
            const arrived = await waitForReport(
                () => matched > i,
                fn => (notify = fn),
                reportMs,
            );
            if (!arrived) {
                failResponse(
                    `step ${step}: write ${i + 1}/${values.length} to ${JSON.stringify(path)} produced no ` +
                        `subscription report carrying ${JSON.stringify(values[i])} within ` +
                        Duration.format(Millis(reportMs)),
                );
            }
        }

        if (mismatch !== undefined) {
            failResponse(`step ${step}: ${mismatch}`);
        }
    }

    // A log-confirmed report can outrun its own callback, so the values are settled here rather than
    // per write.
    const allReported = await waitForReport(
        () => matched >= values.length,
        fn => (notify = fn),
        reportMs,
    );
    if (mismatch !== undefined) {
        failResponse(`step ${step}: ${mismatch}`);
    }
    if (!allReported) {
        failResponse(
            `step ${step}: onUpdate delivered ${JSON.stringify(reported)}, which does not carry the written values ` +
                `${JSON.stringify(values)} in order (matched ${matched}/${values.length}) within ` +
                Duration.format(Millis(reportMs)),
        );
    }

    const idText = idLookup.subscriptionId === undefined ? "(none)" : `0x${idLookup.subscriptionId.toString(16)}`;
    cx.recorder.check({
        type: "response",
        verdict: "pass",
        detail:
            `step ${step}: ${values.length} distinct writes to ${JSON.stringify(path)} — ${logConfirmed} confirmed ` +
            `by their own report on subscription ${idText} in the TH's log, ${values.length - logConfirmed} by ` +
            `onUpdate; onUpdate delivered ${reported.length} reports carrying the written values in order`,
    });
}
