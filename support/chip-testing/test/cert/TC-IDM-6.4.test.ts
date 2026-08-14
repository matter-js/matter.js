/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { EventPathSpec } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    ACK_WAIT_TIMEOUT_MS,
    CommissionedRefs,
    EVENT_PATH_IBS_SEQUENCE,
    eventPathIBSequence,
    expectReportAck,
    expectSequence,
    expectSubscriptionId,
    fabricFilteredPattern,
    requireId,
    SUBSCRIBE_REQUEST_MESSAGE,
} from "./tc-support.js";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const START_UP_EVENT = requireId(BASIC_INFORMATION.events.require("startUp").id, "BasicInformation.startUp");

const ENDPOINT_0 = 0;
const LOG_TIMEOUT_MS = 15_000;

const EVENT_PATH: EventPathSpec = { endpoint: ENDPOINT_0, cluster: BASIC_INFORMATION_ID, event: START_UP_EVENT };

// Each step's own intervals, taken from Test_TC_IDM_6_4.yaml's captures for that step (step 1
// subscribes with 10/100, step 2 with 20/400). Pinning them is what lets the envelope check below
// tell this TC's subscriptions from the node-level one the controller holds anyway.
const STEP_1_MIN_INTERVAL = 10;
const STEP_1_MAX_INTERVAL = 100;
const STEP_2_MIN_INTERVAL = 20;
const STEP_2_MAX_INTERVAL = 400;

function subscribeEnvelopeSequence(minInterval: number, maxInterval: number) {
    return [
        SUBSCRIBE_REQUEST_MESSAGE,
        /\{\s*$/,
        /KeepSubscriptions = true,\s*$/,
        new RegExp(`MinIntervalFloorSeconds = 0x${minInterval.toString(16)},\\s*$`),
        new RegExp(`MaxIntervalCeilingSeconds = 0x${maxInterval.toString(16)},\\s*$`),
        ...EVENT_PATH_IBS_SEQUENCE,
        ...eventPathIBSequence(EVENT_PATH),
    ];
}

const commissioned = new CommissionedRefs();

certTest("TC-IDM-6.4", {
    plan: "interactiondatamodel.adoc",
    pics: ["MCORE.IDM.C", "MCORE.IDM.C.SubscribeRequest", "MCORE.IDM.C.SubscribeEvent"],
    app: "all-clusters",
})
    .step(
        1,
        "DUT sends Subscribe Request Message to the TH for a supported event.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const from = th.log.mark();
            await dut.node(ref).subscribeEvents([EVENT_PATH], {
                minIntervalFloorSeconds: STEP_1_MIN_INTERVAL,
                maxIntervalCeilingSeconds: STEP_1_MAX_INTERVAL,
            });
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: `subscribeEvents ${JSON.stringify(EVENT_PATH)} resolved`,
            });

            const envelopeCheck = await expectSequence(
                th.log,
                th.flavor,
                "SubscribeRequestMessage envelope (KeepSubscriptions, MinIntervalFloorSeconds, " +
                    `MaxIntervalCeilingSeconds, EventPathIBs ${JSON.stringify(EVENT_PATH)})`,
                subscribeEnvelopeSequence(STEP_1_MIN_INTERVAL, STEP_1_MAX_INTERVAL),
                from,
                LOG_TIMEOUT_MS,
            );
            cx.recorder.check(envelopeCheck);
            if (envelopeCheck.verdict === "fail") {
                throw new Error(`SubscribeRequestMessage envelope check failed: ${JSON.stringify(envelopeCheck)}`);
            }

            const fabricFilteredCheck = await expectSequence(
                th.log,
                th.flavor,
                "SubscribeRequestMessage isFabricFiltered",
                [fabricFilteredPattern(true)],
                envelopeCheck.logLine === undefined ? from : envelopeCheck.logLine + 1,
                LOG_TIMEOUT_MS,
            );
            cx.recorder.check(fabricFilteredCheck);
            if (fabricFilteredCheck.verdict === "fail") {
                throw new Error(
                    `SubscribeRequestMessage isFabricFiltered check failed: ${JSON.stringify(fabricFilteredCheck)}`,
                );
            }
        },
        {
            expected:
                "Verify on the TH that the Subscribe Request Message received has these fields " +
                "KeepSubscriptions which is of type bool. MinIntervalFloor which is of type uint16. " +
                "MaxIntervalCeiling which is of type uint16. " +
                "EventRequests - list of request paths to cluster events. Should be a valid EventPathIB from the " +
                "Valid Event Paths table and not target a group. " +
                "EventFilters - list of minimum event numbers per specific node. (Optional) " +
                "FabricFiltered which is of type bool.",
        },
    )
    .step(
        2,
        "DUT sends Subscribe Request Message to the TH. TH sends Report Data message to DUT.",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;

            const from = th.log.mark();
            await cx.controllers.dut.node(ref).subscribeEvents([EVENT_PATH], {
                minIntervalFloorSeconds: STEP_2_MIN_INTERVAL,
                maxIntervalCeilingSeconds: STEP_2_MAX_INTERVAL,
            });
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: `subscribeEvents ${JSON.stringify(EVENT_PATH)} resolved, so the priming report was received`,
            });

            // Several subscriptions of this run report concurrently (step 1's is still live, as is the
            // controller's own node-level one), so the ack this step needs is identified by the
            // subscription the TH just minted, not by position in the log.
            const idLookup = await expectSubscriptionId(th.log, th.flavor, from, ACK_WAIT_TIMEOUT_MS);
            cx.recorder.check(idLookup.check);
            if (idLookup.check.verdict === "fail") {
                throw new Error(`SubscribeResponseMessage check failed: ${JSON.stringify(idLookup.check)}`);
            }

            const ackCheck = await expectReportAck(
                th.log,
                th.flavor,
                idLookup.subscriptionId,
                from,
                ACK_WAIT_TIMEOUT_MS,
            );
            cx.recorder.check(ackCheck);
            if (ackCheck.verdict === "fail") {
                throw new Error(`Report ack check failed: ${JSON.stringify(ackCheck)}`);
            }
        }),
        { expected: "Verify that the DUT sends Status Response Action with a success Status Code." },
    )
    .step(
        3,
        "DUT sends Subscribe Request Message to the TH and TH does not respond with Report Data message to DUT.",
        async () => {},
        { notApplicable: "Not testable / Out of Scope for V1.0 in CHIP's certification harness" },
    )
    .step(
        4,
        "DUT sends Subscribe Request Message to the TH. TH sends Report Data message to DUT. DUT sends Status " +
            "Response Message to the TH. TH does not respond with Subscribe Response message to DUT.",
        async () => {},
        { notApplicable: "Not testable / Out of Scope for V1.0 in CHIP's certification harness" },
    )
    .step(
        5,
        "With an active Event subscription from DUT to TH, TH sends Report Data message to DUT with an invalid " +
            "SubscriptionId.",
        async () => {},
        { notApplicable: "Not testable / Out of Scope for V1.0 in CHIP's certification harness" },
    )
    .step(
        6,
        "With an active Event subscription from DUT to TH, TH sends Report Data message to DUT after the maximum " +
            "interval from the last Report Data.",
        async () => {},
        { notApplicable: "Not testable / Out of Scope for V1.0 in CHIP's certification harness" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
