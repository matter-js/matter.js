/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/main";
import type { CertStepContext, OtaProviderExchanges } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { BdxTransferEvidence } from "./tc-bdx-support.js";
import { serveOtaTransfer, transferOrFail } from "./tc-bdx-support.js";
import {
    bdxImageUriFindings,
    hexByteLength,
    OtaQueryStatus,
    queryStatusName,
    delayedActionTime,
    delayedActionTimeProvenance,
    longRunningReason,
    singleQueryImage,
    unsupportedByDut,
} from "./tc-su-support.js";
import { CertCheckFailedError, CommissionedRefs, record, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** The served update steps 1 and 3 read, and the query with nothing staged that step 2 reads. */
let served: BdxTransferEvidence | undefined;
let unstagedQuery: OtaProviderExchanges | undefined;

function unstagedQueryOrFail(): OtaProviderExchanges {
    if (unstagedQuery === undefined) {
        throw new CertCheckFailedError("the precondition step recorded no query against an empty image catalog");
    }
    return unstagedQuery;
}

async function recordUpdateAvailableFields(cx: CertStepContext) {
    const { transfer } = transferOrFail(served);
    const { request, response } = singleQueryImage(transfer.exchanges);

    await recordAll(cx, [
        {
            what: "Status is UpdateAvailable",
            check: () => ({
                type: "response",
                verdict: response.status === OtaQueryStatus.UpdateAvailable ? "pass" : "fail",
                detail:
                    `the TH set RequestorCanConsent ${request.requestorCanConsent ?? false}, and the DUT answered ` +
                    queryStatusName(response.status),
            }),
        },
        {
            what: "ImageURI, SoftwareVersion and SoftwareVersionString are present",
            check: () => {
                const missing = (["imageUri", "softwareVersion", "softwareVersionString"] as const)
                    .filter(field => response[field] === undefined)
                    .join(", ");
                return {
                    type: "response",
                    verdict: missing === "" ? "pass" : "fail",
                    detail:
                        missing === ""
                            ? `the DUT named "${response.imageUri}" for software version ` +
                              `${response.softwareVersion} ("${response.softwareVersionString}")`
                            : `the DUT's UpdateAvailable answer carries no ${missing}`,
                };
            },
        },
        {
            // The plan puts the version rule as "the same as the new software image version", and the
            // image the transfer then carried is what says which version that was.
            what: "SoftwareVersion names the image the DUT went on to serve",
            check: () => ({
                type: "response",
                verdict: response.softwareVersion === transfer.softwareVersion ? "pass" : "fail",
                detail:
                    `the DUT offered software version ${response.softwareVersion} and served the image it staged ` +
                    `for version ${transfer.softwareVersion}`,
            }),
        },
        {
            what: "UpdateToken is within 8-32 bytes",
            check: () => {
                const length = response.updateToken === undefined ? undefined : hexByteLength(response.updateToken);
                return {
                    type: "response",
                    verdict: length !== undefined && length >= 8 && length <= 32 ? "pass" : "fail",
                    detail:
                        length === undefined
                            ? "the DUT's UpdateAvailable answer carries no UpdateToken"
                            : `the DUT's UpdateToken is ${length} bytes (${response.updateToken})`,
                };
            },
        },
        {
            what: "UserConsentNeeded, where present, is a boolean",
            check: () => ({
                type: "response",
                verdict:
                    response.userConsentNeeded === undefined || typeof response.userConsentNeeded === "boolean"
                        ? "pass"
                        : "fail",
                detail:
                    response.userConsentNeeded === undefined
                        ? "the DUT sent no UserConsentNeeded, which the cluster makes optional"
                        : `the DUT sent UserConsentNeeded ${response.userConsentNeeded}`,
            }),
        },
        {
            what: "MetadataForRequestor is optional",
            check: () => ({
                type: "response",
                verdict: "pass",
                detail:
                    response.metadataForRequestor === undefined
                        ? "the DUT sent no MetadataForRequestor, which the cluster makes optional"
                        : `the DUT sent MetadataForRequestor ${response.metadataForRequestor}`,
            }),
        },
    ]);
}

async function recordBusyThenAvailable(cx: CertStepContext) {
    const dut = cx.controllers.dut;
    const ref = commissioned.get("dut");
    if (ref === undefined) {
        throw new CertCheckFailedError("the TH was not commissioned by the precondition step");
    }
    const delay = delayedActionTime();

    await dut.node(ref).scriptOtaProvider({
        queryImage: [{ status: OtaQueryStatus.Busy, delayedActionTime: delay }],
    });

    // The TH answers Busy by waiting and querying again, so the budget covers the delay the DUT named
    // and the whole update that follows the second answer.
    const busy = await serveOtaTransfer(cx, ref, {
        sender: "dut",
        receiver: "th",
        timeoutMs: Seconds(delay + 90),
    });
    const queries = busy.transfer.exchanges.queryImage;

    await recordAll(cx, [
        {
            what: "the DUT answered the first QueryImage Busy",
            check: () => ({
                type: "response",
                verdict: queries[0]?.response.status === OtaQueryStatus.Busy ? "pass" : "fail",
                detail: `the DUT answered ${queryStatusName(queries[0]?.response.status ?? -1)}`,
            }),
        },
        {
            what: "that answer named the DelayedActionTime the step asked for",
            check: () => ({
                type: "response",
                verdict: queries[0]?.response.delayedActionTime === delay ? "pass" : "fail",
                detail:
                    `the DUT answered DelayedActionTime ${queries[0]?.response.delayedActionTime}s, against ` +
                    delayedActionTimeProvenance(),
            }),
        },
        {
            what: "the DUT answered the TH's next QueryImage UpdateAvailable",
            check: () => ({
                type: "response",
                verdict:
                    queries.length === 2 && queries[1].response.status === OtaQueryStatus.UpdateAvailable
                        ? "pass"
                        : "fail",
                detail:
                    `the TH sent ${queries.length} QueryImage command(s), the last answered ` +
                    queryStatusName(queries[queries.length - 1]?.response.status ?? -1),
            }),
        },
        {
            // The plan's own second claim: the download follows the UpdateAvailable answer, and a DUT
            // that answered it without being able to serve would satisfy the checks above.
            what: "the TH downloaded the image after the second answer",
            check: () => ({
                type: "response",
                verdict:
                    busy.transfer.transferredBytes === busy.transfer.fileSize && busy.transfer.fileSize > 0
                        ? "pass"
                        : "fail",
                detail:
                    `the TH took ${busy.transfer.transferredBytes} of the ${busy.transfer.fileSize} bytes the DUT ` +
                    `staged for software version ${busy.transfer.softwareVersion}`,
            }),
        },
    ]);
}

certTest("TC-SU-3.2", {
    plan: "softwareupdate.adoc",
    pics: ["MCORE.OTA.Provider"],
    app: "ota-requestor",
})
    .step(
        "0a",
        "Precondition: the DUT commissions the TH and announces itself as its OTA provider with nothing staged, " +
            "so the TH queries a provider that has no image for it. This is step 2's own stimulus, and it runs " +
            "first because a staged image cannot be un-staged.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const announced = await dut.node(ref).announceOtaProvider();
            unstagedQuery = announced.exchanges;

            record(
                cx,
                {
                    type: "response",
                    verdict: announced.exchanges.queryImage.length === 1 ? "pass" : "fail",
                    detail:
                        `the announcement drew ${announced.exchanges.queryImage.length} QueryImage command(s) from the ` +
                        "TH, and this case reads the one the plan describes",
                },
                "the announcement drew exactly one QueryImage",
            );
        },
        {
            expected: "The TH sends one QueryImage, which the DUT answers out of an empty image catalog.",
        },
    )
    .step(
        "0b",
        "Precondition: the DUT stages an OTA image for the TH and serves it, so steps 1 and 3 read the answer to " +
            "a query the DUT does have an image for.",
        async cx => {
            const ref = commissioned.get("dut");
            if (ref === undefined) {
                throw new CertCheckFailedError("the TH was not commissioned by the preceding step");
            }
            served = await serveOtaTransfer(cx, ref, { sender: "dut", receiver: "th" });
        },
        {
            expected: "One OTA update runs to completion with the DUT as provider.",
        },
    )
    .step(
        1,
        "OTA-R/TH sends a QueryImage Command to the DUT. RequestorCanConsent may be True or False. (11.19.6.8)",
        recordUpdateAvailableFields,
        {
            expected:
                "Verify that the DUT sends a QueryImageResponse Command to the OTA-R/TH. Status - UpdateAvailable - " +
                "Mandatory. ImageURI - Mandatory. SoftwareVersion - Mandatory. SoftwareVersionString - Mandatory. " +
                "UpdateToken - verify it is within 8-32 bytes. UserConsentNeeded if present should be of type bool. " +
                "MetadataForRequestor - Optional.",
        },
    )
    .step(
        2,
        "There should not be any new software update available for the OTA-R/TH. OTA-R/TH sends a QueryImage " +
            "Command to the DUT. (11.19.6.8)",
        async cx => {
            const { response } = singleQueryImage(unstagedQueryOrFail());
            record(
                cx,
                {
                    type: "response",
                    verdict: response.status === OtaQueryStatus.NotAvailable ? "pass" : "fail",
                    detail: `with nothing staged for the TH, the DUT answered ${queryStatusName(response.status)}`,
                },
                "Status is NotAvailable where the DUT holds no image for the TH",
            );
        },
        {
            expected:
                "Verify that the DUT sends a QueryImageResponse Command to the OTA-R/TH. Status - NotAvailable - " +
                "Mandatory. Rest of the fields are optional.",
        },
    )
    .step(
        3,
        "OTA-R/TH sends a QueryImage Command to the DUT. ProtocolSupported field should list BDX. (11.19.6.8)",
        async cx => {
            const { transfer } = transferOrFail(served);
            const { response } = singleQueryImage(transfer.exchanges);
            const uri = response.imageUri;

            if (uri === undefined) {
                throw new CertCheckFailedError(
                    "the DUT's UpdateAvailable answer carries no ImageURI for this step to read",
                );
            }

            const findings = bdxImageUriFindings(uri, transfer.providerNodeId);
            record(
                cx,
                {
                    type: "response",
                    verdict: findings.length === 0 ? "pass" : "fail",
                    detail:
                        findings.length === 0
                            ? `the DUT named "${uri}", whose scheme, authority and path all conform`
                            : `the DUT named "${uri}": ${findings.join("; ")}`,
                },
                "the ImageURI is the bdx URI the plan describes",
            );
        },
        {
            expected:
                'Verify the URI\'s scheme field is "bdx" in lowercase. The authority field contains only the ' +
                "string representation of the Operational Node ID of the Node where to proceed with the download, " +
                "as exactly 16 uppercase hexadecimal characters, matching the NodeID of the OTA Provider " +
                "responding. The user section of the authority field is absent. The URI carries no Query and no " +
                "Fragment field. The path field has the absolute path to the software image, with only valid URI " +
                "characters. The URI is 24 characters or longer and begins with 'bdx://'.",
        },
    )
    .step(
        4,
        'OTA-R/TH sends a QueryImage Command to the DUT. ProtocolSupported field should list "https". ' + "(11.19.6.8)",
        unsupportedByDut("an https image URI"),
        {
            pics: "MCORE.OTA.HTTPS",
            expected: "Verify the URI should be a valid https string.",
        },
    )
    .step(
        5,
        "OTA-R/TH sends a QueryImage Command to the DUT. DUT responds with QueryStatus Busy and DelayedActionTime " +
            "3 minutes, then UpdateAvailable on the subsequent QueryImage. (11.19.6.8)",
        recordBusyThenAvailable,
        {
            pics: "OTAP.S.M.DelayedActionTime",
            longRunning: longRunningReason("the TH waits out the DelayedActionTime the DUT named"),
            expected:
                "Verify that the DUT sends a QueryImageResponse with Status Busy and DelayedActionTime 3 minutes, " +
                "that the OTA-R/TH starts the download after the second QueryImageResponse with UpdateAvailable, " +
                "and that the image downloaded is the one that was supposed to be downloaded.",
        },
    )
    .finalize(cx => {
        served = undefined;
        unstagedQuery = undefined;
        return commissioned.decommissionAll(cx);
    });
