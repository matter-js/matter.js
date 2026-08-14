/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CheckRecord, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import { expectTimedFollowUp, expectTimedRequest, expectUnicastReceipt } from "./tc-idm-5.1-support.js";
import { CommissionedRefs, INVOKE_REQUEST_MESSAGE, requireId, WRITE_REQUEST_MESSAGE } from "./tc-support.js";

const ON_OFF = Matter.clusters.require("OnOff");
const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const ON_TIME = requireId(ON_OFF.attributes.require("onTime").id, "OnOff.onTime");

const ENDPOINT_1 = 1;

// The timeout Test_TC_IDM_5_1.yaml's own captures ask for, which the plan quotes as its example. The
// device enforces it, so a late follow-up fails on the device's own answer as well as on the check below.
const TIMED_INTERACTION_TIMEOUT_MS = 200;

const LOG_TIMEOUT_MS = 15_000;

const commissioned = new CommissionedRefs();

async function recordTimedInteraction(cx: CertStepContext, message: RegExp, from: number): Promise<void> {
    const th = cx.devices.th;

    const timed = await expectTimedRequest(th.log, th.flavor, TIMED_INTERACTION_TIMEOUT_MS, from, LOG_TIMEOUT_MS);
    record(cx, timed.check, "TimedRequestMessage");

    record(cx, expectUnicastReceipt(timed), "Timed request session");

    const followUp = await expectTimedFollowUp(
        th.log,
        th.flavor,
        message,
        timed,
        TIMED_INTERACTION_TIMEOUT_MS,
        LOG_TIMEOUT_MS,
    );
    record(cx, followUp, "Timed follow-up");
}

function record(cx: CertStepContext, check: CheckRecord, what: string) {
    cx.recorder.check(check);
    if (check.verdict === "fail") {
        throw new Error(`${what} check failed: ${JSON.stringify(check)}`);
    }
}

certTest("TC-IDM-5.1", { plan: "interactiondatamodel.adoc", pics: ["MCORE.IDM.C"], app: "all-clusters" })
    .step(
        1,
        "DUT sends the Timed Request to the TH and then sends an Invoke Request Message to the TH after receiving " +
            "the status response message from the TH. The Timed Request Message should contain a timeout value in " +
            "milliseconds. (Example - 200 milliseconds)",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const from = th.log.mark();
            await dut.node(ref).invoke(ON_OFF_ID, "on", undefined, ENDPOINT_1, {
                timedInteractionTimeoutMs: TIMED_INTERACTION_TIMEOUT_MS,
            });
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: `timed invoke of OnOff.on on endpoint ${ENDPOINT_1} succeeded`,
            });

            await recordTimedInteraction(cx, INVOKE_REQUEST_MESSAGE, from);
        },
        {
            pics: "MCORE.IDM.C.InvokeRequest",
            expected:
                "On the TH verify the received timed request message has the timeout value as sent by the DUT. " +
                "Verify that the message is unicast. Verify that the DUT sends the Invoke Request Message to the TH " +
                "before the specified timeout value. Verify that the Invoke Request has TimedRequest set to True.",
        },
    )
    .step(
        2,
        "DUT sends the Timed Request to the TH and then sends a WriteRequestMessage to the TH after receiving the " +
            "status response message from the TH. The Timed Request Message should contain a timeout value in " +
            "milliseconds. (Example - 200 milliseconds)",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;

            const from = th.log.mark();
            await cx.controllers.dut
                .node(ref)
                .writeAttribute({ endpoint: ENDPOINT_1, cluster: ON_OFF_ID, attribute: ON_TIME }, 2, {
                    timedInteractionTimeoutMs: TIMED_INTERACTION_TIMEOUT_MS,
                });
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: `timed write of OnOff.onTime on endpoint ${ENDPOINT_1} succeeded`,
            });

            await recordTimedInteraction(cx, WRITE_REQUEST_MESSAGE, from);
        }),
        {
            pics: "MCORE.IDM.C.WriteRequest",
            expected:
                "On the TH verify the received timed request message has the timeout value as sent by the DUT. " +
                "Verify that the message is unicast. Verify that the DUT sends the WriteRequestMessage to the TH " +
                "before the specified timeout value. Verify the WriteRequestMessage has the TimedRequest field set " +
                "to TRUE.",
        },
    )
    .step(
        3,
        "DUT sends the Timed Request to the TH The Timed Request Message should contain a timeout value in " +
            "milliseconds. (Example - 200 milliseconds) Force the TH to not send a response back to the DUT for the " +
            "received timed request.",
        async () => {},
        {
            pics: "MCORE.IDM.C.WriteRequest || MCORE.IDM.C.InvokeRequest",
            notApplicable: "Not testable / Out of Scope in CHIP's certification harness",
            expected:
                "Verify that the DUT does not send a follow up message to the TH as it did not receive the initial " +
                "response for the Timed request.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
