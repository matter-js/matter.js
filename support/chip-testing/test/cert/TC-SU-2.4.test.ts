/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import { SPEC_INTERVALS_ARG } from "../../src/OtaRequestorTestInstance.js";
import type { BdxTransferEvidence } from "./tc-bdx-support.js";
import { BDX_RECEIVER_ROLES, serveOtaTransfer } from "./tc-bdx-support.js";
import { recordRequestorIdle, singleApplyUpdate, singleQueryImage } from "./tc-su-support.js";
import { CommissionedRefs, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();

async function recordApplyUpdateRequest(cx: CertStepContext) {
    const { transfer }: BdxTransferEvidence = await serveOtaTransfer(cx, commissioned.require("th", "the DUT"), {
        sender: "th",
        receiver: "dut",
        expectApply: true,
    });
    const query = singleQueryImage(transfer.exchanges);
    const { request } = singleApplyUpdate(transfer.exchanges);

    await recordAll(cx, [
        {
            what: "UpdateToken is the one the TH sent in its QueryImageResponse",
            check: () => ({
                type: "response",
                verdict:
                    query.response.updateToken !== undefined && request.updateToken === query.response.updateToken
                        ? "pass"
                        : "fail",
                detail:
                    `the DUT sent update token ${request.updateToken}, and the TH answered its QueryImage with ` +
                    `${query.response.updateToken ?? "no token"}`,
            }),
        },
        {
            what: "NewVersion is the software version the DUT downloaded",
            check: () => ({
                type: "response",
                verdict:
                    request.newVersion === transfer.softwareVersion && transfer.transferredBytes === transfer.fileSize
                        ? "pass"
                        : "fail",
                detail:
                    `the DUT asked to apply version ${request.newVersion}, having downloaded ` +
                    `${transfer.transferredBytes} of ${transfer.fileSize} bytes of version ${transfer.softwareVersion}`,
            }),
        },
    ]);
}

certTest("TC-SU-2.4", {
    plan: "softwareupdate.adoc",

    // The provider and announcement keys are the TH's, which here is the controller, as in TC-SU-2.1:
    // serving the update announces it.
    pics: ["MCORE.OTA.Requestor", "MCORE.OTA.Provider", "OTAR.C.M.AnnounceOTAProvider"],
    app: "ota-requestor",
    ...BDX_RECEIVER_ROLES,

    // chip's ota-requestor-app ends the update at the download unless started with --autoApplyImage,
    // and having applied, it exits, which this harness reads as the DUT dying mid-run. The request this
    // case is about is the one that precedes the exit, so there is no chip leg that survives it.
    flavors: ["matterjs"],

    // A requestor DUT runs as a product would, whatever the run shortens for a requestor TH
    appArgs: { dut: { matterjs: [SPEC_INTERVALS_ARG] } },
})
    .step(
        "0",
        "Precondition: TH and DUT are on the same fabric, and there is no ongoing OTA process on the DUT.",
        async cx => {
            const th = cx.controllers.th;
            const dut = cx.devices.dut;

            const ref = await th.commission({
                passcode: dut.commissioning.passcode,
                discriminator: dut.commissioning.discriminator,
            });
            commissioned.set("th", ref);

            await recordRequestorIdle(cx, th.node(ref));
        },
        {
            expected:
                "The TH holds the DUT on its fabric, and reading the UpdateState Attribute of the OTA Requestor " +
                "returns Idle.",
        },
    )
    .step(
        1,
        "DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT with " +
            'QueryStatus "UpdateAvailable" and ImageURI set to the location of the image. After the DUT ' +
            "transfers the image, the DUT should send ApplyUpdateRequest to the OTA-P. (11.19.6.10)",
        recordApplyUpdateRequest,
        {
            expected:
                "Verify that the request received on the OTA-P has the following mandatory fields. UpdateToken - " +
                "verify that it is same as the one sent in the QueryImageResponse. NewVersion - verify that this " +
                "is the same as the software version that was downloaded.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
