/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, MatterError, Millis, Time } from "@matter/main";
import type { AttributePathSpec, CertNodeRef, CertStepContext, CheckRecord, LogFollower } from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError } from "@matter/testing";
import {
    expectAdjacentLines,
    expectMessageWithPath,
    REPORT_DATA_MESSAGE,
    STATUS_RESPONSE_SUCCESS,
    SUBSCRIBE_REQUEST_MESSAGE,
    SUBSCRIBE_RESPONSE_MESSAGE,
    subscriptionIdPattern,
    SUBSCRIPTION_ID_LINE,
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

// Bounds waiting for a StatusResponseMessage that should already have been sent by the time this
// wait starts (the controller's own report-processing acks a report as part of handling it) — this
// only needs to cover the log follower's own pump lag, not any protocol-level delay.
export const ACK_WAIT_TIMEOUT_MS = 15_000;

/** What the TH's own SubscribeResponse says about the subscription a step just established. */
export interface SubscriptionIdLookup {
    check: CheckRecord;
    /** Absent when the lookup failed, and for the matterjs flavor. */
    subscriptionId?: number;
}

/**
 * Reads back the id the TH minted for the subscription whose SubscribeResponse it sends at or after
 * `from`. Every step here keeps its subscriptions (`keepSubscriptions: true`) and their max interval
 * is shorter than the whole run, so several subscriptions report concurrently from step 3 onward —
 * the id is what tells one step's reports from another's. `"unverified"` for the matterjs flavor,
 * whose logger emits no decode dump to read an id out of.
 */
export async function expectSubscriptionId(
    log: LogFollower,
    flavor: string,
    from: number,
    timeoutMs: number,
): Promise<SubscriptionIdLookup> {
    const sequence = [SUBSCRIBE_RESPONSE_MESSAGE, /\{\s*$/, SUBSCRIPTION_ID_LINE];
    try {
        const result = await expectAdjacentLines(log, flavor, sequence, from, timeoutMs);
        if (result.verdict === "unverified") {
            return { check: { type: "device-log", verdict: "unverified" } };
        }

        const id = SUBSCRIPTION_ID_LINE.exec(result.last.text)?.[1];
        if (id === undefined) {
            return {
                check: {
                    type: "device-log",
                    verdict: "fail",
                    pattern: String(SUBSCRIPTION_ID_LINE),
                    detail: `SubscribeResponseMessage carries no readable subscription id: ${result.last.text}`,
                    logLine: result.last.index,
                },
            };
        }

        return {
            subscriptionId: parseInt(id, 16),
            check: {
                type: "device-log",
                verdict: "pass",
                pattern: String(SUBSCRIBE_RESPONSE_MESSAGE),
                matched: result.last.text,
                logLine: result.last.index,
            },
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return {
                check: {
                    type: "device-log",
                    verdict: "fail",
                    pattern: String(SUBSCRIBE_RESPONSE_MESSAGE),
                    detail: e.message,
                    logLine: from,
                },
            };
        }
        throw e;
    }
}

// chip's own trace line for an outbound message — printed once, immediately before that message's
// raw/decode dump — names the CHIP Exchange id it was sent on (verified against a real capture:
// `>> to UDP:[...] | <msgCounter> | [Interaction Model  (1) / Report Data (0x05) / Session = <s> /
// Exchange = <id>]`). Matter Core's MRP (§ 4.12) always acks a message on the exchange it was
// received on, and the same capture shows the DUT's ack line naming that identical id, so this is
// what ties one specific report to one specific ack even though the two lines aren't adjacent (a
// variable amount of raw-frame/decode-dump content sits between a trace line and its own message
// name line, depending on payload size).
const REPORT_SENT_LINE = /\[DMG\] >> to UDP:.*\/ Report Data \(0x05\) \/ Session = \d+ \/ Exchange = (\d+)\]\s*$/;

function reportAckedOnExchange(exchange: string): RegExp {
    return new RegExp(
        `\\[DMG\\] << from UDP:.*/ Status Response \\(0x01\\) / Session = \\d+ / Exchange = ${exchange}\\]\\s*$`,
    );
}

// The acknowledging message's own decode dump, which chip prints directly after the trace line above:
// `StatusResponseMessage =`, `{`, then the status as its first nested field
// (StatusResponseMessage::Parser::PrettyPrint). The status must be read out of *this* block — a
// forward search for a success line instead finds the next ack in the stream, and a run acks one
// report per write per live subscription, so a rejected report would be reported as accepted.
const STATUS_RESPONSE_MESSAGE = /\[DMG\] StatusResponseMessage =\s*$/;
const OPENING_BRACE = /\{\s*$/;
// chip renders the status as `0x%02x (%s)` with `StatusName` for the name, and those names are not all
// SCREAMING_SNAKE_CASE: a deprecated or reserved code is named after its own value (`Deprecated82`) and
// a code outside chip's list is not named at all (`Unallocated`).
const ANY_STATUS_LINE = /Status = 0x[\da-fA-F]+ \(\w+\),?\s*$/;

// How far back from a matched ReportDataMessage's own decode dump to look for its trace line —
// generous relative to the largest gap seen in a real capture (chunked multi-attribute priming
// reports, tens of lines), so this is a runaway-loop guard, not a tuned bound.
const EXCHANGE_LOOKBACK_LINES = 1000;

/**
 * The trace line naming a message's own Exchange id is the *nearest* one preceding that message's
 * decode dump: chip logs one message at a time, so no other message's own trace line can land in
 * between. Scanning backward from the decode dump (rather than forward from a fixed cursor) is what
 * makes this correct regardless of how many raw-frame lines chip printed for this particular
 * message's payload size.
 */
function exchangeIdBefore(log: LogFollower, beforeIndex: number): string | undefined {
    const floor = Math.max(0, beforeIndex - EXCHANGE_LOOKBACK_LINES);
    const lines = log.lines;
    for (let i = beforeIndex - 1; i >= floor; i--) {
        const match = REPORT_SENT_LINE.exec(lines[i].text);
        if (match) {
            return match[1];
        }
    }
    return undefined;
}

/**
 * Confirms the TH sent a report on subscription `subscriptionId` at or after `from` and that the DUT
 * answered *that specific report* with a Success StatusResponse. The subscription id alone only
 * proves the report is ours; several subscriptions' report/ack cycles can be in flight over the
 * seconds it takes chip to send a report and receive its ack, so a plain "next Success StatusResponse
 * after this report" search can still land on a different subscription's ack landing in that window.
 * This closes that gap by reading the CHIP Exchange id our report was sent on (see
 * {@link REPORT_SENT_LINE}) and requiring the ack to arrive on that same exchange — a different
 * subscription's own report/ack pair carries its own, different exchange id, so it can no longer
 * stand in for ours. `"unverified"` for the matterjs flavor (no `subscriptionId`, no chip decode
 * dump to match).
 */
export async function expectReportAck(
    log: LogFollower,
    flavor: string,
    subscriptionId: number | undefined,
    from: number,
    timeoutMs: number,
): Promise<CheckRecord> {
    if (subscriptionId === undefined) {
        return { type: "device-log", verdict: "unverified" };
    }

    const deadline = Time.nowMs + timeoutMs;
    const remaining = () => Math.max(1, deadline - Time.nowMs);
    const pattern = `ReportDataMessage(SubscriptionId = 0x${subscriptionId.toString(16)}) then its own ${STATUS_RESPONSE_SUCCESS} (matched by Exchange id)`;

    try {
        const report = await expectAdjacentLines(
            log,
            flavor,
            [REPORT_DATA_MESSAGE, /\{\s*$/, subscriptionIdPattern(subscriptionId)],
            from,
            remaining(),
        );
        if (report.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const exchange = exchangeIdBefore(log, report.last.index);
        if (exchange === undefined) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern,
                detail: `No outbound Report Data trace line (carrying an Exchange id) found before line ${report.last.index}`,
                logLine: report.last.index,
            };
        }

        const ackHeader = await log.expect(
            { chip: reportAckedOnExchange(exchange) },
            { flavor, timeoutMs: remaining(), from: report.last.index + 1 },
        );
        if (ackHeader.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const messageName = await log.expect(
            { chip: STATUS_RESPONSE_MESSAGE },
            { flavor, timeoutMs: remaining(), from: ackHeader.matched.index + 1 },
        );
        if (messageName.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const brace = await log.expect(
            { chip: OPENING_BRACE },
            { flavor, timeoutMs: remaining(), from: messageName.matched.index + 1 },
        );
        if (brace.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const status = await log.expect(
            { chip: ANY_STATUS_LINE },
            { flavor, timeoutMs: remaining(), from: brace.matched.index + 1 },
        );
        if (status.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        // Reading anything but this block's own first two lines means the dump did not have the shape
        // this check reasons about, so the status found cannot be attributed to our ack.
        if (brace.matched.index !== messageName.matched.index + 1 || status.matched.index !== brace.matched.index + 1) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern,
                detail:
                    `StatusResponseMessage at line ${messageName.matched.index} is not followed by "{" and a ` +
                    `status line (found "{" at ${brace.matched.index}, status at ${status.matched.index})`,
                logLine: messageName.matched.index,
            };
        }

        if (!STATUS_RESPONSE_SUCCESS.test(status.matched.text)) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern,
                detail: `The DUT acked our report with ${status.matched.text.trim()}`,
                matched: status.matched.text,
                logLine: status.matched.index,
            };
        }

        return {
            type: "device-log",
            verdict: "pass",
            pattern,
            matched: status.matched.text,
            logLine: status.matched.index,
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", pattern, detail: e.message, logLine: from };
        }
        throw e;
    }
}

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
