/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { BdxTransferEvidence } from "./tc-bdx-support.js";
import { blocksReceived, overMessages, serveOtaTransfer, transferOrFail } from "./tc-bdx-support.js";
import { blockSizeConforms, MIN_NON_TCP_BLOCK_SIZE, singleQueryImage } from "./tc-su-support.js";
import { CertCheckFailedError, CommissionedRefs, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** The one transfer this case reads, served by the precondition step. */
let served: BdxTransferEvidence | undefined;

async function recordTransferConduct(cx: CertStepContext) {
    const { transfer, from } = transferOrFail(served);
    const { proposal, accept } = transfer;
    const th = cx.devices.th;

    await recordAll(cx, [
        {
            // The plan's own alternative, asynchronous mode, is for a TCP transport; this run is over
            // MRP, so receiver drive is what it requires.
            what: "the DUT drives the transfer the way a non-TCP transport requires",
            check: () => ({
                type: "response",
                verdict: accept.mode === "receiverDrive" && !accept.asynchronousTransfer ? "pass" : "fail",
                detail:
                    `the DUT granted ${accept.mode}${accept.asynchronousTransfer ? " with asynchronous transfer" : ""} ` +
                    `against a proposal of senderDrive=${proposal.senderDrive} receiverDrive=${proposal.receiverDrive}`,
            }),
        },
        {
            what: "the granted Max Block Size follows the plan's rule for the size the TH proposed",
            check: () => ({
                type: "response",
                verdict: blockSizeConforms(proposal.maxBlockSize, accept.maxBlockSize) ? "pass" : "fail",
                detail: `the TH proposed ${proposal.maxBlockSize} bytes and the DUT granted ${accept.maxBlockSize}`,
            }),
        },
        {
            // A provider that grants less than this cannot serve a peer asking for the plan's minimum,
            // which is what the rule is about — so the claim is about what it would grant, and the
            // proposal this run carried is the evidence for it.
            what: "the DUT supports at least 1024 bytes per block over this non-TCP transport",
            check: () => {
                // A TH that asked for less never put the floor to the DUT, and a pass there would be
                // certification evidence for a requirement nothing exercised.
                if (proposal.maxBlockSize < MIN_NON_TCP_BLOCK_SIZE) {
                    return {
                        type: "response",
                        verdict: "unverified",
                        detail:
                            `the TH asked for only ${proposal.maxBlockSize} bytes, below the ` +
                            `${MIN_NON_TCP_BLOCK_SIZE}-byte floor the plan requires the DUT to support`,
                        accepted:
                            "the block size is the TH's to propose, and this one proposed less than the floor, so " +
                            "nothing here put that requirement to the DUT",
                    };
                }
                return {
                    type: "response",
                    verdict: accept.maxBlockSize >= MIN_NON_TCP_BLOCK_SIZE ? "pass" : "fail",
                    detail: `the TH asked for ${proposal.maxBlockSize} bytes and the DUT granted ${accept.maxBlockSize}`,
                };
            },
        },
        {
            // Every block this reads is already a non-final one: the last arrives as a BlockEOF, which
            // the receiver answers with a BlockAckEOF rather than the BlockQuery this reads, so it is
            // absent from the list. Dropping a further entry here would leave the second-to-last block
            // unchecked, which is the one a sender most plausibly gets wrong.
            what: "every block but the last carried the negotiated Max Block Size",
            check: () => {
                const blocks = blocksReceived(th.log, th.flavor, from);
                const expected = Math.ceil(transfer.fileSize / accept.maxBlockSize) - 1;
                return overMessages(blocks, "blocks the TH took in", "TransferSession::HandleBlock", messages => {
                    const short = messages.filter(message => message.length !== accept.maxBlockSize);
                    return {
                        ok: messages.length === expected && short.length === 0,
                        detail:
                            `the TH took in ${messages.length} non-final block(s) of the ${expected} the ` +
                            `${transfer.fileSize}-byte image needs at ${accept.maxBlockSize} bytes each, ` +
                            `${short.length} of them not the negotiated size`,
                    };
                });
            },
        },
        {
            // The receiver is what establishes this: `OtaRequestorTestInstance` re-derives the staged
            // payload and compares it byte for byte before it will apply, so a transfer that delivered
            // the wrong bytes fails there rather than here. On a chip TH the size is what is checkable.
            what: "the image the TH downloaded is the one the DUT staged",
            check: () => ({
                type: "response",
                verdict: transfer.transferredBytes === transfer.fileSize && transfer.fileSize > 0 ? "pass" : "fail",
                detail:
                    `the DUT sent ${transfer.transferredBytes} of the ${transfer.fileSize} bytes it staged for ` +
                    `software version ${transfer.softwareVersion}` +
                    (transfer.applyAcknowledged
                        ? ", and the TH asked to apply it, which it does only after validating the file"
                        : ""),
            }),
        },
    ]);
}

/**
 * Drives one update whose `QueryImageResponse` carries `UserConsentNeeded` set to `needed`, and records
 * what the DUT sent and what followed.
 *
 * The plan's two steps differ only in that field and in what each expects of the *consent*, which for
 * this DUT is neither obtained nor obtainable: a controller has no user interface. What is checkable is
 * that the DUT stated the field the requestor is meant to act on, and that the requestor — which can
 * consent — went on to download either way.
 */
async function recordUserConsentNeeded(cx: CertStepContext, needed: boolean) {
    const dut = cx.controllers.dut;
    const ref = commissioned.get("dut");
    if (ref === undefined) {
        throw new CertCheckFailedError("the TH was not commissioned by the precondition step");
    }

    await dut.node(ref).scriptOtaProvider({ queryImage: [{ userConsentNeeded: needed }] });
    const consented = await serveOtaTransfer(cx, ref, { sender: "dut", receiver: "th" });
    const { response } = singleQueryImage(consented.transfer.exchanges);

    await recordAll(cx, [
        {
            what: `the DUT answered with UserConsentNeeded ${needed}`,
            check: () => ({
                type: "response",
                verdict: response.userConsentNeeded === needed ? "pass" : "fail",
                detail: `the DUT sent UserConsentNeeded ${response.userConsentNeeded}`,
            }),
        },
        {
            // The plan splits on whether the DUT asks its own user. This DUT is a controller with no
            // user to ask, and the requestor it serves declares it can consent for itself, so the
            // checkable outcome is the same on both steps: the update proceeded.
            what: "the TH downloaded the image the DUT offered",
            check: () => ({
                type: "response",
                verdict:
                    consented.transfer.transferredBytes === consented.transfer.fileSize &&
                    consented.transfer.fileSize > 0
                        ? "pass"
                        : "fail",
                detail:
                    `the TH took ${consented.transfer.transferredBytes} of the ` +
                    `${consented.transfer.fileSize} bytes the DUT staged`,
            }),
        },
        {
            what: "the DUT asked its own user for consent",
            check: () => ({
                type: "response",
                verdict: "unverified",
                accepted:
                    "the plan makes this vendor specific, and this DUT is a controller with no user interface: " +
                    "it states UserConsentNeeded and leaves the decision to the requestor",
            }),
        },
    ]);
}

certTest("TC-SU-3.3", {
    plan: "softwareupdate.adoc",
    pics: ["MCORE.OTA.Provider"],
    app: "ota-requestor",
})
    .step(
        "0",
        "Precondition: the DUT commissions the TH, stages an OTA image for it and announces itself as its OTA " +
            "provider, so the TH downloads the image this case reads the transfer of.",
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
            expected: "One OTA download runs to completion with the DUT as provider and the TH as requestor.",
        },
    )
    .step(
        1,
        'OTA-R/TH sends a QueryImage Command to the DUT. Protocol supported should only list "BDX". DUT ' +
            "responds with the QueryImageResponse to the OTA-R/TH. (11.19.3.5)",
        recordTransferConduct,
        {
            expected:
                "Verify that the OTA-R/TH starts the download from the DUT. Verify that the DUT uses Receiver-Drive " +
                "mode for transfers on non-TCP transport. Verify that the Actual Block Size should be the " +
                "negotiated Maximum Block Size for every block except the last one. Verify the Maximum Block Size " +
                "constraints: a power of two if OTA-R/TH requests larger than 128 bytes, the exact requested value " +
                "between 16 and 128 bytes, at least 1024 bytes over non-TCP transports. Verify that the image " +
                "downloaded by the OTA-R/TH is valid and is the same image that was supposed to be downloaded.",
        },
    )
    .step(
        2,
        "TH sends a QueryImage command to the DUT. RequestorCanConsent is set to True by TH. DUT responds with a " +
            "QueryImageResponse with UserConsentNeeded set to True. (11.19.6.6)",
        cx => recordUserConsentNeeded(cx, true),
        {
            pics: "OTAP.S.M.UserConsentNeeded",
            expected:
                "Verify that the DUT does not try to obtain User Consent from the user prior to transfer of " +
                "software update image.",
        },
    )
    .step(
        3,
        "TH sends a QueryImage command to the DUT. RequestorCanConsent is set to True by TH. DUT responds with a " +
            "QueryImageResponse with UserConsentNeeded set to False. (11.19.6.6)",
        cx => recordUserConsentNeeded(cx, false),
        {
            pics: "OTAP.S.M.UserConsentNeeded",
            expected:
                "Verify that the DUT tries to obtain User Consent from the user prior to transfer of software " +
                "update image.",
        },
    )
    .step(
        4,
        "During the transfer of the image from the DUT, force fail the transfer before it completely transfers " +
            "the image. Wait for the Idle timeout. Initiate another QueryImage Command from OTA-R/TH to the DUT. " +
            "(11.19.3.5)",
        async () => {},
        {
            notApplicable:
                "the harness cannot fail a transfer part way: the TH is a requestor driving its own download, and " +
                "nothing in this suite can drop its BDX exchange while leaving it able to query again",
            expected:
                "Verify that the DUT stops sending the image and can restart sending from the beginning when a new " +
                "QueryImage request is received. Verify that the BDX Idle timeout should be no less than 5 minutes.",
        },
    )
    .step(
        5,
        "During the transfer of the image from the DUT, force fail the transfer, then initiate another QueryImage " +
            "with the RC[STARTOFS] bit and STARTOFS field set in the ReceiveInit. (11.19.3.5)",
        async () => {},
        {
            notApplicable:
                "as step 4, and additionally the STARTOFS the step turns on is the TH's own to send: neither " +
                "requestor this suite runs as the TH resumes an aborted download",
            expected:
                "Verify that the DUT resumes the previously aborted transfer. Verify that the DUT finishes sending " +
                "the image to the TH.",
        },
    )
    .finalize(cx => {
        served = undefined;
        return commissioned.decommissionAll(cx);
    });
