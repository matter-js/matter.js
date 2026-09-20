/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { BdxTransferEvidence } from "./tc-bdx-support.js";
import { serveOtaTransfer, transferOrFail } from "./tc-bdx-support.js";
import { applyActionName, OtaApplyAction, singleApplyUpdate, singleQueryImage } from "./tc-su-support.js";
import { CommissionedRefs, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** The one update this case reads, served by the precondition step. */
let served: BdxTransferEvidence | undefined;

async function recordApplyUpdateResponse(cx: CertStepContext) {
    const { transfer } = transferOrFail(served);
    const { request, response } = singleApplyUpdate(transfer.exchanges);
    const query = singleQueryImage(transfer.exchanges);

    await recordAll(cx, [
        {
            what: "the DUT answered the TH's ApplyUpdateRequest with Proceed",
            check: () => ({
                type: "response",
                verdict: response.action === OtaApplyAction.Proceed ? "pass" : "fail",
                detail:
                    `the TH asked to apply version ${request.newVersion} under update token ` +
                    `${request.updateToken}, and the DUT answered ${applyActionName(response.action)}`,
            }),
        },
        {
            // The plan asks only that the field be there and be a number; zero and non-zero are both
            // conforming, and this DUT answers zero because it allows the update immediately.
            what: "the DUT named a DelayedActionTime",
            check: () => ({
                type: "response",
                verdict: Number.isInteger(response.delayedActionTime) ? "pass" : "fail",
                detail: `the DUT answered DelayedActionTime ${response.delayedActionTime} seconds`,
            }),
        },
        {
            // Not part of the plan's own wording, and the claim the rest of this step rests on: an
            // answer about a different update would satisfy both checks above.
            what: "the ApplyUpdateRequest names the update the DUT offered",
            check: () => ({
                type: "response",
                verdict:
                    request.updateToken === query.response.updateToken &&
                    request.newVersion === transfer.softwareVersion
                        ? "pass"
                        : "fail",
                detail:
                    `the TH asked to apply version ${request.newVersion} under token ${request.updateToken}, ` +
                    `against the version ${transfer.softwareVersion} the DUT offered under token ` +
                    `${query.response.updateToken}`,
            }),
        },
    ]);
}

certTest("TC-SU-3.4", {
    plan: "softwareupdate.adoc",
    pics: ["MCORE.OTA.Provider"],
    app: "ota-requestor",

    // chip's ota-requestor-app ends the update at the download without this, so the ApplyUpdateRequest
    // this case is about would never be sent. chip's own Test_TC_SU_3_4 passes the same flag.
    appArgs: { th: ["--autoApplyImage"] },
})
    .step(
        "0",
        "Precondition: the DUT commissions the TH, stages an OTA image for it and announces itself as its OTA " +
            "provider, so the TH downloads the image and then asks to apply it.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            served = await serveOtaTransfer(cx, ref, { sender: "dut", receiver: "th", expectApply: true });
        },
        {
            expected:
                "One OTA update runs to completion with the DUT as provider, ending in the TH's own " +
                "ApplyUpdateRequest.",
        },
    )
    .step(
        1,
        "OTA-R/TH on completion of image download sends an ApplyUpdateRequest Command to the DUT. (11.19.6.11)",
        recordApplyUpdateResponse,
        {
            expected:
                "Verify that the DUT sends an ApplyUpdateResponse Command to the OTA Requestor. Verify that the " +
                "following fields are non empty. Action - Proceed. DelayedActionTime - Zero or non zero.",
        },
    )
    .step(
        2,
        "OTA-R/TH sends an ApplyUpdateRequest. DUT responds with ApplyUpdateResponse with Action AwaitNextAction " +
            "and DelayedActionTime 3 minutes, then Proceed on the subsequent request. (11.19.6.11)",
        async () => {},
        {
            notApplicable:
                "this DUT's provider answers an ApplyUpdateRequest Proceed where it holds consent for the update " +
                "and Discontinue where it does not; it has no state in which it defers, so the answer the step " +
                "asks for cannot be produced",
            expected:
                "Verify that the DUT sends an ApplyUpdateResponse with Action AwaitNextAction and DelayedActionTime " +
                "3 minutes.",
        },
    )
    .step(
        3,
        "OTA-R/TH sends an ApplyUpdateRequest. DUT responds with ApplyUpdateResponse with Action Discontinue. " +
            "Initiate another QueryImage Command from OTA-R/TH to the DUT. (11.19.6.11)",
        async () => {},
        {
            notApplicable:
                "the DUT answers Discontinue only for an update it holds no consent for, and the consent is what " +
                "makes it serve the image in the first place: there is no order of steps in which the TH downloads " +
                "an image and is then refused the apply",
            expected:
                'Verify that the DUT sends an ApplyUpdateResponse with "Discontinue" in the action field. Verify ' +
                "that the entire OTA process is restarted on DUT when OTA-R/TH sends another QueryImage Request.",
        },
    )
    .finalize(cx => {
        served = undefined;
        return commissioned.decommissionAll(cx);
    });
