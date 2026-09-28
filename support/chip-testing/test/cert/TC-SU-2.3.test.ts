/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/main";
import type { CertStepContext, OtaScriptedQueryAnswer } from "@matter/testing";
import { certTest, UnsupportedByControllerError } from "@matter/testing";
import { BDX_RECEIVER_ROLES, serveOtaTransfer } from "./tc-bdx-support.js";
import {
    latestRequestorStateChange,
    MAX_NON_TCP_BLOCK_SIZE,
    MAX_TCP_BLOCK_SIZE,
    OtaQueryStatus,
    queryStatusName,
    recordRequestorIdle,
    requestorStateChanges,
    singleQueryImageCheck,
    UPDATE_STATE_DELAYED_ON_USER_CONSENT,
    UPDATE_STATE_DOWNLOADING,
} from "./tc-su-support.js";
import { CommissionedRefs, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();

/**
 * How long a step gives the whole exchange: the announcement, the DUT's `QueryImage` and the transfer.
 *
 * Above the two minutes § 11.20.3.2 puts between two queries, because the announcement arrives soon
 * after the DUT's last query and a requestor honoring that rule holds the next one back until it has
 * passed. The rest covers the transfer that follows.
 */
const UPDATE_TIMEOUT = Seconds(210);

/** Has the TH's provider answer `queryImage`, as a step failure rather than an exception. */
async function script(cx: CertStepContext, queryImage: OtaScriptedQueryAnswer[]) {
    try {
        await cx.controllers.th.node(commissioned.require("th", "the DUT")).scriptOtaProvider({ queryImage });
    } catch (e) {
        // Before the check, not after: the runner turns this into a skipped step only while the step has
        // recorded nothing
        if (e instanceof UnsupportedByControllerError) {
            throw e;
        }
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }
}

/**
 * Step 1: the TH answers `UserConsentNeeded` True, and the DUT must obtain consent before it transfers.
 *
 * The consent itself is vendor specific, but the state the requestor passes through on its way to it is
 * not: § 11.20.7.4.2 gives `DelayedOnUserConsent` for exactly this, so a requestor that obtained consent
 * recorded a `StateTransition` into it ahead of the one into `Downloading`.
 */
async function recordConsentBeforeTransfer(cx: CertStepContext) {
    const ref = commissioned.require("th", "the DUT");
    const node = cx.controllers.th.node(ref);
    const after = await latestRequestorStateChange(node);

    await script(cx, [{ userConsentNeeded: true }]);
    const { transfer } = await serveOtaTransfer(cx, ref, {
        sender: "th",
        receiver: "dut",
        timeoutMs: UPDATE_TIMEOUT,
    });

    const [query] = transfer.exchanges.queryImage;
    const changes = await requestorStateChanges(node, after);
    const consented = changes.find(({ newState }) => newState === UPDATE_STATE_DELAYED_ON_USER_CONSENT);
    const downloading = changes.find(({ newState }) => newState === UPDATE_STATE_DOWNLOADING);

    await recordAll(cx, [
        {
            what: "the served update carried the one QueryImage the plan describes",
            check: () => singleQueryImageCheck(transfer.exchanges),
        },
        {
            what: "the DUT offered to obtain the consent itself",
            check: () => ({
                type: "response",
                verdict: query?.request.requestorCanConsent === true ? "pass" : "fail",
                detail:
                    query === undefined
                        ? "the DUT sent no QueryImage"
                        : `the DUT sent RequestorCanConsent ${query.request.requestorCanConsent}`,
            }),
        },
        {
            what: "the TH answered that query UpdateAvailable with UserConsentNeeded True",
            check: () => ({
                type: "response",
                verdict:
                    query?.response.status === OtaQueryStatus.UpdateAvailable &&
                    query.response.userConsentNeeded === true
                        ? "pass"
                        : "fail",
                detail:
                    query === undefined
                        ? "the DUT sent no QueryImage"
                        : `the TH answered ${queryStatusName(query.response.status)} with UserConsentNeeded ` +
                          `${query.response.userConsentNeeded}`,
            }),
        },
        {
            what: "the DUT obtained consent before it started transferring",
            check: () => ({
                type: "response",
                verdict:
                    consented !== undefined &&
                    downloading !== undefined &&
                    consented.eventNumber < downloading.eventNumber
                        ? "pass"
                        : "fail",
                detail:
                    `the DUT's requestor recorded ${changes.length} state transition(s) over this step: ` +
                    `DelayedOnUserConsent (${UPDATE_STATE_DELAYED_ON_USER_CONSENT}) ` +
                    (consented === undefined ? "not at all" : `as event ${consented.eventNumber}`) +
                    `, Downloading (${UPDATE_STATE_DOWNLOADING}) ` +
                    (downloading === undefined ? "not at all" : `as event ${downloading.eventNumber}`),
            }),
        },
        {
            what: "the DUT then took the image the TH offered",
            check: () => ({
                type: "response",
                verdict: transfer.transferredBytes === transfer.fileSize && transfer.fileSize > 0 ? "pass" : "fail",
                detail:
                    `the DUT took ${transfer.transferredBytes} of the ${transfer.fileSize} bytes of software ` +
                    `version ${transfer.softwareVersion} the TH staged`,
            }),
        },
        {
            what: "the DUT asked a user for that consent",
            check: () => ({
                type: "response",
                verdict: "unverified",
                accepted:
                    "the plan makes this vendor specific, and this DUT has no user interface to ask through: its " +
                    "requestor declares CanConsent and answers for itself, which the state it passed through shows",
            }),
        },
    ]);
}

/**
 * Step 2: a plain update, and the Max Block Size the DUT asked for.
 *
 * The plan states one limit per transport and `OtaBdxTransfer` reports no transport, so the non-TCP limit
 * is the one this asserts: no case in this suite asks for TCP, and the matter.js requestor proposes the
 * non-TCP size unless its own channel is TCP. A TCP leg would need the transport on the record rather
 * than a second constant here.
 */
async function recordTransferBlockSize(cx: CertStepContext) {
    const ref = commissioned.require("th", "the DUT");
    const { transfer } = await serveOtaTransfer(cx, ref, {
        sender: "th",
        receiver: "dut",
        timeoutMs: UPDATE_TIMEOUT,
    });
    const { proposal } = transfer;
    const [query] = transfer.exchanges.queryImage;

    await recordAll(cx, [
        {
            what: "the served update carried the one QueryImage the plan describes",
            check: () => singleQueryImageCheck(transfer.exchanges),
        },
        {
            what: "the TH answered the DUT's QueryImage UpdateAvailable",
            check: () => ({
                type: "response",
                verdict: query?.response.status === OtaQueryStatus.UpdateAvailable ? "pass" : "fail",
                detail:
                    query === undefined
                        ? "the DUT sent no QueryImage"
                        : `the TH answered ${queryStatusName(query.response.status)} with ImageURI ` +
                          `${query.response.imageUri}`,
            }),
        },
        {
            what: "the DUT downloaded the image from the TH",
            check: () => ({
                type: "response",
                verdict: transfer.transferredBytes === transfer.fileSize && transfer.fileSize > 0 ? "pass" : "fail",
                detail:
                    `the DUT took ${transfer.transferredBytes} of the ${transfer.fileSize} bytes of software ` +
                    `version ${transfer.softwareVersion} the TH staged`,
            }),
        },
        {
            what: "the Max Block Size the DUT asked for is within the plan's limit for this transport",
            check: () => ({
                type: "response",
                verdict:
                    Number.isInteger(proposal.maxBlockSize) &&
                    proposal.maxBlockSize > 0 &&
                    proposal.maxBlockSize <= MAX_NON_TCP_BLOCK_SIZE
                        ? "pass"
                        : "fail",
                detail:
                    `the DUT proposed ${proposal.maxBlockSize} bytes per block, against the plan's ` +
                    `${MAX_NON_TCP_BLOCK_SIZE} bytes for a non-TCP transport (${MAX_TCP_BLOCK_SIZE} over TCP)`,
            }),
        },
    ]);
}

certTest("TC-SU-2.3", {
    plan: "softwareupdate.adoc",

    // The provider and announcement keys are the TH's, which here is the controller, as in TC-SU-2.1.
    pics: ["MCORE.OTA.Requestor", "MCORE.OTA.Provider", "OTAR.C.M.AnnounceOTAProvider"],
    app: "ota-requestor",
    ...BDX_RECEIVER_ROLES,
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
                "The TH holds the DUT on its fabric with the ACL entries commissioning installs, and reading the " +
                "UpdateState Attribute of the OTA Requestor returns Idle.",
        },
    )
    .step(
        1,
        "DUT sends a QueryImage command to the TH/OTA-P. RequestorCanConsent is set to True by DUT. OTA-P/TH " +
            "responds with a QueryImageResponse with UserConsentNeeded field set to True. (11.19.6.6)",
        recordConsentBeforeTransfer,
        {
            pics: "MCORE.OTA.RequestorConsent",
            expected:
                "Verify that the DUT obtains the User Consent from the user prior to transfer of software update " +
                "image. This step is vendor specific.",
        },
    )
    .step(
        2,
        "DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT. " +
            'QueryStatus is set to "UpdateAvailable". Set ImageURI to the location where the image is located. ' +
            "(11.19.3.5)",
        recordTransferBlockSize,
        {
            expected:
                "Verify that there is a transfer of the software image from the TH/OTA-P to the DUT. Verify that " +
                "the Maximum Block Size requested by DUT should be no larger than 1024 (2^10) bytes over non-TCP " +
                "transports, no larger than 8192 (2^13) bytes over TCP transport.",
        },
    )
    .step(
        3,
        "DUT sends a QueryImage command to the TH/OTA-P. TH/OTA-P sends a QueryImageResponse back to DUT. " +
            'QueryStatus is set to "UpdateAvailable". Set ImageURI with the https url of the software image. ' +
            "(11.19.3.5)",
        async () => {},
        {
            notApplicable:
                "the TH's provider offers images over BDX only, so it cannot give the https ImageURI this step needs",
            expected:
                "Verify that there is a transfer of the software image from the TH/OTA-P to the DUT from the https " +
                "url and not from the OTA-P.",
        },
    )
    .step(
        4,
        "During the transfer of the image to the DUT, force fail the transfer before it completely transfers the " +
            "image. Wait for the Idle timeout so that reading the UpdateState Attribute of the OTA Requestor " +
            "returns the value as Idle. Initiate another QueryImage Command from DUT to the TH/OTA-P. (11.19.3.5)",
        async () => {},
        {
            notApplicable:
                "the harness cannot fail a transfer part way: the TH serves the image as a BDX responder, and " +
                "nothing in this suite can drop its exchange while leaving the DUT able to query again",
            expected:
                "Verify that the BDX Idle timeout should be no less than 5 minutes. Verify that the DUT starts a " +
                "new transfer of software image when sending another QueryImage request.",
        },
    )
    .step(
        5,
        "During the transfer of the image to the DUT, force fail the transfer before it completely transfers the " +
            "image. Initiate another QueryImage Command from DUT to the TH/OTA-P. Set the RC[STARTOFS] bit and " +
            "associated STARTOFS field in the ReceiveInit Message to indicate the resumption of a transfer " +
            "previously aborted. (11.19.3.5)",
        async () => {},
        {
            notApplicable:
                "as step 4: with no transfer the harness can abort, there is nothing to resume, and the STARTOFS " +
                "this step turns on is the DUT's own to send",
            expected:
                "Verify that the DUT starts receiving the rest of the software image after resuming the image " +
                "transfer.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
