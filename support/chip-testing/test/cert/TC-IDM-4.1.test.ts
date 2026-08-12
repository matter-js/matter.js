/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, Time } from "@matter/main";
import { Matter } from "@matter/model";
import type { AttributePathSpec, CertNodeRef, CertStepContext, CheckRecord, LogFollower } from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError, certTest } from "@matter/testing";
import {
    CommissionedRefs,
    expectAdjacentLines,
    expectMessageWithPath,
    REPORT_DATA_MESSAGE,
    requireId,
    STATUS_RESPONSE_SUCCESS,
    SUBSCRIBE_REQUEST_MESSAGE,
    SUBSCRIBE_RESPONSE_MESSAGE,
    subscriptionIdPattern,
    SUBSCRIPTION_ID_LINE,
} from "./tc-support.js";

const ON_OFF = Matter.clusters.require("OnOff");
const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const LEVEL_CONTROL = Matter.clusters.require("LevelControl");

const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const LEVEL_CONTROL_ID = requireId(LEVEL_CONTROL.id, "LevelControl cluster");

const ON_OFF_ATTRIBUTE = requireId(ON_OFF.attributes.require("onOff").id, "OnOff.onOff");
const LOCAL_CONFIG_DISABLED = requireId(
    BASIC_INFORMATION.attributes.require("localConfigDisabled").id,
    "BasicInformation.localConfigDisabled",
);
const NODE_LABEL = requireId(BASIC_INFORMATION.attributes.require("nodeLabel").id, "BasicInformation.nodeLabel");
const ON_OFF_TRANSITION_TIME = requireId(
    LEVEL_CONTROL.attributes.require("onOffTransitionTime").id,
    "LevelControl.onOffTransitionTime",
);

const ENDPOINT_0 = 0;
const ENDPOINT_1 = 1;

// The subscriber's own choice of negotiated interval — matches Test_TC_IDM_4_1.yaml's own step-1
// capture (MinIntervalFloorSeconds=0xa, MaxIntervalCeilingSeconds=0x50) and is reused for every
// subscription in this TC; the plan does not mandate a different interval per step.
const MIN_INTERVAL_FLOOR_SECONDS = 10;
const MAX_INTERVAL_CEILING_SECONDS = 80;

// ServerSubscription's #prepareDataUpdate (packages/node/src/node/server/ServerSubscription.ts)
// enforces MinIntervalFloor as a real per-report debounce: a change landing before the floor has
// elapsed since the last report is coalesced into the next one, not reported on its own. Each write
// in subscribeAndModify waits for its own report before the next write is issued, so this bounds
// that wait (floor plus slack for scheduling/CI jitter), not the write itself.
const UPDATE_WAIT_TIMEOUT_MS = (MIN_INTERVAL_FLOOR_SECONDS + 20) * 1000;

// Bounds waiting for a StatusResponseMessage that should already have been sent by the time this
// wait starts (the controller's own report-processing acks a report as part of handling it) — this
// only needs to cover the log follower's own pump lag, not any protocol-level delay.
const ACK_WAIT_TIMEOUT_MS = 15_000;

// chip's own decode dump for the request's top-level fields, verified against Test_TC_IDM_4_1.yaml's
// step-1 capture (--keepSubscriptions true). Both intervals are pinned to the exact values this test
// requests: PhysicalDeviceProperties.subscriptionIntervalBoundsFor (packages/protocol/src/peer/)
// jitters only a ceiling it derived itself, so a caller-supplied one reaches the wire unchanged —
// pinning it here is what keeps that guarantee under test.
const SUBSCRIBE_ENVELOPE_SEQUENCE = [
    SUBSCRIBE_REQUEST_MESSAGE,
    /\{\s*$/,
    /KeepSubscriptions = true,\s*$/,
    new RegExp(`MinIntervalFloorSeconds = 0x${MIN_INTERVAL_FLOOR_SECONDS.toString(16)},\\s*$`),
    new RegExp(`MaxIntervalCeilingSeconds = 0x${MAX_INTERVAL_CEILING_SECONDS.toString(16)},\\s*$`),
    /AttributePathIBs =\s*$/,
];

/**
 * Confirms the SubscribeRequestMessage envelope's own top-level fields — KeepSubscriptions,
 * MinIntervalFloorSeconds, MaxIntervalCeilingSeconds, then the AttributePathIBs list (chip's own
 * field label for the spec's AttributeRequests; see Test_TC_IDM_4_1.yaml) — appear, in that order, as
 * a consecutive block at or after `from` (see {@link expectAdjacentLines}). Returns `"unverified"` for
 * the matterjs flavor, matching every other chip-only check in this series.
 */
async function expectSubscribeEnvelope(
    log: LogFollower,
    flavor: string,
    from: number,
    timeoutMs: number,
): Promise<CheckRecord> {
    try {
        const result = await expectAdjacentLines(log, flavor, SUBSCRIBE_ENVELOPE_SEQUENCE, from, timeoutMs);
        if (result.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }
        return {
            type: "device-log",
            verdict: "pass",
            pattern:
                "SubscribeRequestMessage envelope (KeepSubscriptions, MinIntervalFloorSeconds, MaxIntervalCeilingSeconds, AttributePathIBs)",
            matched: result.last.text,
            logLine: result.last.index,
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", detail: e.message, logLine: from };
        }
        throw e;
    }
}

/** What the TH's own SubscribeResponse says about the subscription a step just established. */
interface SubscriptionIdLookup {
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
async function expectSubscriptionId(
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
async function expectReportAck(
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

        const ack = await log.expect(
            { chip: STATUS_RESPONSE_SUCCESS },
            { flavor, timeoutMs: remaining(), from: ackHeader.matched.index + 1 },
        );
        if (ack.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        return {
            type: "device-log",
            verdict: "pass",
            pattern,
            matched: ack.matched.text,
            logLine: ack.matched.index,
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", pattern, detail: e.message, logLine: from };
        }
        throw e;
    }
}

/**
 * Waits until `getCount() >= target` or `timeoutMs` elapses, woken by `setNotify`'s callback firing
 * rather than polling on a bare sleep. The timeout's own `Time.sleep` is always canceled once the
 * race settles (win or lose), so a lost race can't leave an armed timer outliving the step and
 * racing teardown.
 */
async function waitForCount(
    getCount: () => number,
    setNotify: (fn: (() => void) | undefined) => void,
    target: number,
    timeoutMs: number,
): Promise<boolean> {
    if (getCount() >= target) {
        return true;
    }
    const notified = new Promise<void>(resolve => setNotify(resolve));
    const timeout = Time.sleep("TC-IDM-4.1 subscription update wait", Millis(timeoutMs));
    try {
        await Promise.race([notified, timeout]);
    } finally {
        setNotify(undefined);
        timeout.cancel();
    }
    return getCount() >= target;
}

/**
 * Subscribes to `path`, verifies the SubscribeRequestMessage/AttributePathIB log shape, then writes
 * each of `values` in turn — waiting for that write's own subscription report (observed via
 * `onUpdate`, and compared against the value just written) before issuing the next write. Firing
 * every write first and only then waiting would let MinIntervalFloor coalesce two writes landing
 * inside the same floor window into a single report, so this pacing is what makes "N writes -> N
 * reports" hold, not an incidental choice.
 *
 * Each write's chip-flavor ack is awaited individually and anchored on the report that carries this
 * subscription's own id (see {@link expectReportAck}): write 1 chains from the priming report's ack,
 * every later write from the previous write's. Every window's start is therefore a specific,
 * already-occurred log event, never a bare mark — subscribe() resolving only means the client has
 * sent the priming ack, not that this log has received and decoded it yet, so a bare mark taken at
 * that point could still race it.
 */
async function subscribeAndModify<Value>(
    cx: CertStepContext,
    ref: CertNodeRef,
    step: number,
    path: AttributePathSpec,
    values: Value[],
): Promise<void> {
    const th = cx.devices.th;
    const from = th.log.mark();

    let updates = 0;
    let mismatch: string | undefined;
    let notify: (() => void) | undefined;
    await cx.controllers.dut.node(ref).subscribe(path, {
        minIntervalFloorSeconds: MIN_INTERVAL_FLOOR_SECONDS,
        maxIntervalCeilingSeconds: MAX_INTERVAL_CEILING_SECONDS,
        onUpdate: value => {
            const expected = values[updates];
            updates++;
            if (mismatch === undefined && value !== expected) {
                mismatch = `update ${updates}/${values.length} reported ${JSON.stringify(value)}, expected the written value ${JSON.stringify(expected)}`;
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
        15_000,
    );
    cx.recorder.check(subscribeCheck);
    if (subscribeCheck.verdict === "fail") {
        throw new Error(`SubscribeRequestMessage log check failed for step ${step}: ${JSON.stringify(subscribeCheck)}`);
    }

    // The follower pumps the device stream asynchronously, so a previous step's SubscribeResponse
    // can surface after this step marked — reading the id out of that one pins every later check to
    // the wrong subscription.
    const established = subscribeCheck.logLine !== undefined ? subscribeCheck.logLine + 1 : from;

    const idLookup = await expectSubscriptionId(th.log, th.flavor, established, ACK_WAIT_TIMEOUT_MS);
    cx.recorder.check(idLookup.check);
    if (idLookup.check.verdict === "fail") {
        throw new Error(`Subscription-id lookup failed for step ${step}: ${JSON.stringify(idLookup.check)}`);
    }

    const primingAckCheck = await expectReportAck(
        th.log,
        th.flavor,
        idLookup.subscriptionId,
        established,
        ACK_WAIT_TIMEOUT_MS,
    );
    cx.recorder.check(primingAckCheck);
    if (primingAckCheck.verdict === "fail") {
        throw new Error(`Priming-report status check failed for step ${step}: ${JSON.stringify(primingAckCheck)}`);
    }
    let ackCursor = primingAckCheck.logLine !== undefined ? primingAckCheck.logLine + 1 : th.log.mark();
    for (let i = 0; i < values.length; i++) {
        try {
            await cx.controllers.dut.node(ref).writeAttribute(path, values[i]);
        } catch (e) {
            cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
            throw e;
        }

        const reported = await waitForCount(
            () => updates,
            fn => (notify = fn),
            i + 1,
            UPDATE_WAIT_TIMEOUT_MS,
        );
        if (!reported) {
            const detail =
                `step ${step}: write ${i + 1}/${values.length} to ${JSON.stringify(path)} produced no subscription ` +
                `report within ${Duration.format(Millis(UPDATE_WAIT_TIMEOUT_MS))}`;
            cx.recorder.check({ type: "response", verdict: "fail", detail });
            throw new Error(detail);
        }

        const ackCheck = await expectReportAck(
            th.log,
            th.flavor,
            idLookup.subscriptionId,
            ackCursor,
            ACK_WAIT_TIMEOUT_MS,
        );
        cx.recorder.check(ackCheck);
        if (ackCheck.verdict === "fail") {
            throw new Error(
                `StatusResponse ack check failed for step ${step}, write ${i + 1}/${values.length}: ${JSON.stringify(ackCheck)}`,
            );
        }
        if (ackCheck.logLine !== undefined) {
            ackCursor = ackCheck.logLine + 1;
        }
    }

    if (mismatch !== undefined) {
        const detail = `step ${step}: ${mismatch}`;
        cx.recorder.check({ type: "response", verdict: "fail", detail });
        throw new Error(detail);
    }
    cx.recorder.check({
        type: "response",
        verdict: "pass",
        detail: `step ${step}: ${values.length} distinct writes to ${JSON.stringify(path)} each produced their own subscription report carrying the written value (onUpdate fired ${updates} times)`,
    });
}

const commissioned = new CommissionedRefs();

certTest("TC-IDM-4.1", {
    plan: "interactiondatamodel.adoc",
    pics: ["MCORE.IDM.C.SubscribeRequest"],
    app: "all-clusters",
})
    .step(
        1,
        "DUT sends a subscription request message to the target node/reference device for a single attribute " +
            "of any data type supported.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const from = th.log.mark();
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: ON_OFF_ID,
                attribute: ON_OFF_ATTRIBUTE,
            };
            await dut.node(ref).subscribe(path, {
                minIntervalFloorSeconds: MIN_INTERVAL_FLOOR_SECONDS,
                maxIntervalCeilingSeconds: MAX_INTERVAL_CEILING_SECONDS,
            });
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: `subscribe() resolved for ${JSON.stringify(path)}`,
            });

            const pathCheck = await expectMessageWithPath(
                th.log,
                th.flavor,
                SUBSCRIBE_REQUEST_MESSAGE,
                path,
                from,
                15_000,
            );
            cx.recorder.check(pathCheck);
            if (pathCheck.verdict === "fail") {
                throw new Error(`SubscribeRequestMessage log check failed: ${JSON.stringify(pathCheck)}`);
            }

            const envelopeCheck = await expectSubscribeEnvelope(th.log, th.flavor, from, 15_000);
            cx.recorder.check(envelopeCheck);
            if (envelopeCheck.verdict === "fail") {
                throw new Error(`SubscribeRequestMessage envelope check failed: ${JSON.stringify(envelopeCheck)}`);
            }
        },
        {
            pics: "MCORE.IDM.C.SubscribeRequest",
            expected:
                "On the TH verify the subscription message received has KeepSubscriptions (bool), MinIntervalFloor " +
                "(uint16), MaxIntervalCeiling (uint16) and AttributeRequests (list of attribute paths).",
        },
    )
    .step(
        2,
        "DUT sends the subscription request message to TH. TH sends a report data. DUT sends the status " +
            "response back to TH.",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const from = th.log.mark();
            const path: AttributePathSpec = { endpoint: ENDPOINT_1, cluster: ON_OFF_ID, attribute: ON_OFF_ATTRIBUTE };

            await cx.controllers.dut.node(ref).subscribe(path, {
                minIntervalFloorSeconds: MIN_INTERVAL_FLOOR_SECONDS,
                maxIntervalCeilingSeconds: MAX_INTERVAL_CEILING_SECONDS,
            });
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: "subscribe() resolved after receiving and acking the priming report",
            });

            const requestCheck = await expectMessageWithPath(
                th.log,
                th.flavor,
                SUBSCRIBE_REQUEST_MESSAGE,
                path,
                from,
                15_000,
            );
            cx.recorder.check(requestCheck);
            if (requestCheck.verdict === "fail") {
                throw new Error(`SubscribeRequestMessage log check failed: ${JSON.stringify(requestCheck)}`);
            }

            // Steps 1 and 2 subscribe to the same path, so only the request line tells their
            // SubscribeResponses apart (see subscribeAndModify).
            const established = requestCheck.logLine !== undefined ? requestCheck.logLine + 1 : from;

            const idLookup = await expectSubscriptionId(th.log, th.flavor, established, ACK_WAIT_TIMEOUT_MS);
            cx.recorder.check(idLookup.check);
            if (idLookup.check.verdict === "fail") {
                throw new Error(`Subscription-id lookup failed: ${JSON.stringify(idLookup.check)}`);
            }

            const logCheck = await expectReportAck(
                th.log,
                th.flavor,
                idLookup.subscriptionId,
                established,
                ACK_WAIT_TIMEOUT_MS,
            );
            cx.recorder.check(logCheck);
            if (logCheck.verdict === "fail") {
                throw new Error(`Priming-report status check failed: ${JSON.stringify(logCheck)}`);
            }
        }),
        {
            pics: "MCORE.IDM.C.SubscribeRequest",
            expected: 'Verify on the TH that the status response received from the DUT is "Success".',
        },
    )
    .step(
        3,
        "Activate the subscription between the DUT and the TH for an attribute of data type boolean. Modify " +
            "that attribute on the TH. TH should send the modified data to the DUT. Modify the attribute " +
            "multiple times (3 times).",
        commissioned.withRef("dut", (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: BASIC_INFORMATION_ID,
                attribute: LOCAL_CONFIG_DISABLED,
            };
            return subscribeAndModify(cx, ref, 3, path, [true, false, true]);
        }),
        {
            pics: "MCORE.IDM.C.SubscribeRequest.Attribute.DataType_Bool",
            expected:
                'Verify on the TH that the status response received from the DUT for every report data sent is a "Success".',
        },
    )
    .step(
        4,
        "Activate the subscription between the DUT and the TH for an attribute of data type string. Modify " +
            "that attribute on the TH. TH should send the modified data to the DUT. Modify the attribute " +
            "multiple times (3 times).",
        commissioned.withRef("dut", (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: BASIC_INFORMATION_ID,
                attribute: NODE_LABEL,
            };
            return subscribeAndModify(cx, ref, 4, path, ["tc-idm-4-1-a", "tc-idm-4-1-b", "tc-idm-4-1-c"]);
        }),
        {
            pics: "MCORE.IDM.C.SubscribeRequest.Attribute.DataType_String",
            expected:
                'Verify on the TH that the status response received from the DUT for every report data sent is a "Success".',
        },
    )
    .step(
        5,
        "Activate the subscription between the DUT and the TH for an attribute of data type unsigned integer. " +
            "Modify that attribute on the TH. TH should send the modified data to the DUT. Modify the attribute " +
            "multiple times (3 times).",
        commissioned.withRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: LEVEL_CONTROL_ID,
                attribute: ON_OFF_TRANSITION_TIME,
            };
            await subscribeAndModify(cx, ref, 5, path, [1, 2, 3]);
        }),
        {
            pics: "MCORE.IDM.C.SubscribeRequest.Attribute.DataType_UnsignedInteger",
            expected:
                'Verify on the TH that the status response received from the DUT for every report data sent is a "Success".',
        },
    )
    .step(
        6,
        "Activate the subscription between the DUT and the TH for an attribute of data type signed integer. " +
            "Modify that attribute on the TH. TH should send the modified data to the DUT. Modify the attribute " +
            "multiple times (3 times).",
        async () => {},
        { notApplicable: "CHIP's certification harness names no signed-integer attribute for this step" },
    )
    .step(
        7,
        "Activate the subscription between the DUT and the TH for an attribute of data type Floating Point. " +
            "Modify that attribute on the TH. TH should send the modified data to the DUT. Modify the attribute " +
            "multiple times (3 times).",
        async () => {},
        { notApplicable: "CHIP's certification harness names no floating-point attribute for this step" },
    )
    .step(
        8,
        "Activate the subscription between the DUT and the TH for an attribute of data type list. Modify that " +
            "attribute on the TH. TH should send the modified data to the DUT. Modify the attribute multiple " +
            "times (3 times).",
        async () => {},
        { notApplicable: "CHIP's certification harness names no list attribute for this step" },
    )
    .step(
        9,
        "Activate the subscription between the DUT and the TH for an attribute. Force the TH to not send any " +
            "report data for the duration of the maximum interval. After the maximum interval, TH sends a " +
            "report data with the subscription id created during the subscription activation.",
        async () => {},
        {
            notApplicable:
                "Not verifiable/Out of scope in CHIP's certification harness: forcing the TH to withhold reports " +
                "and replay an expired subscription id has no defined mechanism",
        },
    )
    .step(
        10,
        "DUT sends a subscription request message to the target node/reference device for multiple attributes " +
            "(>1 attributes).",
        async () => {},
        {
            notApplicable:
                "CertNodeApi.subscribe accepts a single AttributePathSpec and SubscribeOptions.onUpdate has no " +
                "per-path attribution — one subscription cannot carry the three concrete paths this step needs " +
                "without an adapter API change (see AGENTS.md)",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
