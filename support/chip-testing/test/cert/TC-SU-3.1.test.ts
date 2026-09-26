/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { BdxTransferEvidence } from "./tc-bdx-support.js";
import { serveOtaTransfer, transferOrFail } from "./tc-bdx-support.js";
import { OtaQueryStatus, queryImageResponseLines, queryStatusName, singleQueryImage } from "./tc-su-support.js";
import { CommissionedRefs, expectSequence, LOG_TIMEOUT, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** The one update this case reads, served by the precondition step. */
let served: BdxTransferEvidence | undefined;

async function recordQueryImageResponse(cx: CertStepContext) {
    const { transfer, from } = transferOrFail(served);
    const { request, response } = singleQueryImage(transfer.exchanges);
    const th = cx.devices.th;

    await recordAll(cx, [
        {
            what: "the DUT answered the TH's QueryImage with UpdateAvailable",
            check: () => ({
                type: "response",
                verdict: response.status === OtaQueryStatus.UpdateAvailable ? "pass" : "fail",
                detail:
                    `the TH asked for vendor ${request.vendorId} product ${request.productId} at software ` +
                    `version ${request.softwareVersion}, and the DUT answered ${queryStatusName(response.status)}`,
            }),
        },
        {
            // The requestor refuses a response missing any of these outright
            // (`OtaSoftwareUpdateRequestorServer`: "mandatory fields missing"), so a transfer happening
            // at all says they were there; what this records is which values they carried.
            what: "the QueryImageResponse carries the fields an UpdateAvailable answer must",
            check: () => {
                const missing = (["imageUri", "softwareVersion", "softwareVersionString", "updateToken"] as const)
                    .filter(field => response[field] === undefined)
                    .join(", ");
                return {
                    type: "response",
                    verdict: missing === "" ? "pass" : "fail",
                    detail:
                        missing === ""
                            ? `the DUT offered software version ${response.softwareVersion} ` +
                              `("${response.softwareVersionString}") at "${response.imageUri}" under update token ` +
                              `${response.updateToken}`
                            : `the DUT's UpdateAvailable answer carries no ${missing}`,
                };
            },
        },
        {
            // "Able to query the server where the software update image is located" is what the plan
            // asks of the DUT, and a URI it cannot then serve from would satisfy every field check
            // above while answering the question wrongly.
            what: "the DUT could serve the image it named",
            check: () => ({
                type: "response",
                verdict: transfer.fileSize > 0 && transfer.transferredBytes === transfer.fileSize ? "pass" : "fail",
                detail:
                    `the TH downloaded ${transfer.transferredBytes} of the ${transfer.fileSize} bytes the DUT ` +
                    `staged for software version ${transfer.softwareVersion}`,
            }),
        },
        {
            what: "the TH received the QueryImageResponse the DUT recorded sending",
            check: async () => {
                const check = await expectSequence(
                    th.log,
                    th.flavor,
                    "QueryImageResponse the TH received",
                    queryImageResponseLines(response),
                    from,
                    LOG_TIMEOUT,
                );
                if (check.verdict !== "unverified") {
                    return check;
                }
                return {
                    ...check,
                    accepted:
                        "matter.js's requestor writes no line for a QueryImageResponse it received, so this " +
                        "flavor cannot state the response's fields; the DUT's own record above is what carries " +
                        "them, and the transfer is what shows the TH acted on them",
                };
            },
        },
        {
            // The plan's own Notes: "User Consent is obtained from the user and is specific to vendor
            // implementation." This DUT is a controller with no user to ask, and its provider answers
            // the query on the consent it already holds for the update the case staged.
            what: "the DUT obtained user consent before answering",
            check: () => ({
                type: "response",
                verdict: "unverified",
                accepted:
                    "the plan makes this step vendor specific, and this DUT is a controller with no user " +
                    "interface: its provider answers on the consent the update was staged with",
            }),
        },
    ]);
}

certTest("TC-SU-3.1", {
    plan: "softwareupdate.adoc",
    pics: ["MCORE.OTA.Provider"],
    app: "ota-requestor",
})
    .step(
        "0",
        "Precondition: the DUT commissions the TH, stages an OTA image for it and announces itself as the TH's " +
            "OTA provider, so the TH sends the QueryImage this case reads the answer to.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            served = await serveOtaTransfer(cx, ref, { sender: "dut", receiver: "th" });
        },
        {
            expected:
                "One OTA update runs to completion with the DUT as provider. The plan's own Test Setup puts the " +
                "two on one fabric with the requestor idle; an announcement is how this harness makes the " +
                "requestor query.",
        },
    )
    .step(
        1,
        "OTA-R/TH sends a QueryImage Command to the DUT. UserConsentNeeded field is set to False. (11.19.6.7)",
        recordQueryImageResponse,
        {
            expected:
                "Verify that the DUT is able to query the server where the software update image is located. DUT " +
                "should obtain the User Consent from the user. DUT should respond with the QueryImageResponse to the " +
                "OTA-R/TH.",
        },
    )
    .finalize(cx => {
        served = undefined;
        return commissioned.decommissionAll(cx);
    });
