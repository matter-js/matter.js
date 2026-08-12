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
    countMatches,
    expectAdjacentLines,
    expectMessageWithPath,
    requireId,
    STATUS_RESPONSE_SUCCESS,
    SUBSCRIBE_REQUEST_MESSAGE,
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

// chip's own decode dump for the request's top-level fields, verified against Test_TC_IDM_4_1.yaml's
// step-1 capture. KeepSubscriptions is literally `false` here (not chip-tool's own `true`, used only
// in that yaml's capture) because InProcessCertNodeApi.subscribe hardcodes
// `keepSubscriptions: false` — SubscribeOptions has no way to request `true` today.
const SUBSCRIBE_ENVELOPE_SEQUENCE = [
    SUBSCRIBE_REQUEST_MESSAGE,
    /\{\s*$/,
    /KeepSubscriptions = false,\s*$/,
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

/**
 * Waits until `getCount() >= target` or `timeoutMs` elapses, woken by `setNotify`'s callback firing
 * rather than polling on a bare sleep — the same bounded-wait idiom `TC-CADMIN-1.17.test.ts`'s
 * `expectRejection` uses. The timeout's own `Time.sleep` is always canceled once the race settles
 * (win or lose), so a lost race can't leave an armed timer outliving the step and racing teardown.
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
 * `onUpdate`) before issuing the next write. Firing every write first and only then waiting would let
 * MinIntervalFloor coalesce two writes landing inside the same floor window into a single report
 * (see `UPDATE_WAIT_TIMEOUT_MS`), so this is what makes "N writes -> N reports" hold rather than an
 * incidental pacing choice.
 *
 * Records a `"response"` check that every write produced its own report (this is real on every
 * flavor, since `onUpdate` reflects an actual subscription report, not a log scrape — this is the
 * check that actually gates step failure), and — chip flavors only — a `"device-log"` check that at
 * least `values.length` StatusIB successes appear in `[afterSubscribe, now)`. Only one subscription
 * to this peer is ever live at a time — `keepSubscriptions: false` (hardcoded in
 * `InProcessControllerAdapter.subscribe`) makes every new `subscribe()` call close every earlier
 * subscription to the same peer on both sides (`ClientInteraction.subscribe` and
 * `InteractionServer`'s subscribe handling), not merely the window's own start/end points — so an
 * earlier step's subscription can't still be sending reports into this step's window. This is a
 * belt-and-suspenders check regardless: the `"response"` check above already throws on a genuine
 * reporting failure before this one runs, so even a miscounted window here couldn't turn a real
 * failure into a false pass.
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
    let notify: (() => void) | undefined;
    await cx.controllers.dut.node(ref).subscribe(path, {
        minIntervalFloorSeconds: MIN_INTERVAL_FLOOR_SECONDS,
        maxIntervalCeilingSeconds: MAX_INTERVAL_CEILING_SECONDS,
        onUpdate: () => {
            updates++;
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

    const afterSubscribe = th.log.mark();
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
    }
    cx.recorder.check({
        type: "response",
        verdict: "pass",
        detail: `step ${step}: ${values.length} distinct writes to ${JSON.stringify(path)} each produced their own subscription report (onUpdate fired ${updates} times)`,
    });

    const logCheck: CheckRecord = th.flavor.startsWith("chip")
        ? (() => {
              const count = countMatches(th.log, th.flavor, STATUS_RESPONSE_SUCCESS, afterSubscribe);
              return {
                  type: "device-log",
                  verdict: count >= values.length ? "pass" : "fail",
                  pattern: String(STATUS_RESPONSE_SUCCESS),
                  detail: `${count} SUCCESS status lines between step ${step}'s subscribe and the end of its ${values.length} writes`,
              } satisfies CheckRecord;
          })()
        : { type: "device-log", verdict: "unverified" };
    cx.recorder.check(logCheck);
    if (logCheck.verdict === "fail") {
        throw new Error(`StatusResponse success-count check failed for step ${step}: ${JSON.stringify(logCheck)}`);
    }
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

            try {
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
            } catch (e) {
                await commissioned.decommissionAll(cx);
                throw e;
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
        commissioned.guardedWithRef("dut", async (cx, ref) => {
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

            const logCheck: CheckRecord = th.flavor.startsWith("chip")
                ? (() => {
                      const count = countMatches(th.log, th.flavor, STATUS_RESPONSE_SUCCESS, from);
                      return {
                          type: "device-log",
                          verdict: count >= 1 ? "pass" : "fail",
                          pattern: String(STATUS_RESPONSE_SUCCESS),
                          detail: `${count} SUCCESS status lines since this step's own subscribe`,
                      } satisfies CheckRecord;
                  })()
                : { type: "device-log", verdict: "unverified" };
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
        commissioned.guardedWithRef("dut", (cx, ref) => {
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
        commissioned.guardedWithRef("dut", (cx, ref) => {
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
        commissioned.guardedWithRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: LEVEL_CONTROL_ID,
                attribute: ON_OFF_TRANSITION_TIME,
            };
            await subscribeAndModify(cx, ref, 5, path, [1, 2, 3]);
            await commissioned.decommissionAll(cx);
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
    );
