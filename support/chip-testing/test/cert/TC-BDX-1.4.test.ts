/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BdxTransferAccept, BdxTransferProposal, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    chipProposedTransferControl,
    chipRangeControl,
    chipTransferControl,
    chipX64,
    receiveAcceptPayload,
    receiveInitPayloadPrefix,
    serveOtaTransfer,
    type BdxTransferEvidence,
} from "./tc-bdx-support.js";
import { CertCheckFailedError, CommissionedRefs, expectSequence, LOG_TIMEOUT, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** The one transfer this case reads, served by the precondition step. */
let served: BdxTransferEvidence | undefined;

function transferOrFail(): BdxTransferEvidence {
    if (served === undefined) {
        throw new CertCheckFailedError("the precondition step served no BDX transfer for this step to read");
    }
    return served;
}

/**
 * Whether the mode the responder chose is one the initiator offered.
 *
 * The plan asks for "exactly one mode … out of the original proposed transfer methods". That the
 * accept names exactly one is settled on the wire by {@link receiveAcceptPayload}, whose byte carries
 * one mode bit; what remains here is that the one chosen was on offer.
 */
function modeProposed(proposal: BdxTransferProposal, accept: BdxTransferAccept) {
    return accept.mode === "senderDrive" ? proposal.senderDrive : proposal.receiverDrive;
}

/**
 * Whether the accept's Length conforms, which the plan makes conditional on the initiator having
 * indicated one: an accept may carry none, and where the initiator named none there is nothing for it
 * to be equal to or smaller than.
 */
function lengthConforms(proposal: BdxTransferProposal, accept: BdxTransferAccept) {
    if (accept.definiteLength === undefined || proposal.definiteLength === undefined) {
        return true;
    }
    return accept.definiteLength <= proposal.definiteLength;
}

function lengthDetail(proposal: BdxTransferProposal, accept: BdxTransferAccept) {
    if (proposal.definiteLength === undefined) {
        return (
            `the initiator proposed an indefinite length, so no proposed length constrains the accept; ` +
            `the accept names ${accept.definiteLength === undefined ? "none either" : `${accept.definiteLength} bytes`}`
        );
    }
    if (accept.definiteLength === undefined) {
        return `the accept names no definite length against the proposed ${proposal.definiteLength} bytes`;
    }
    return `the accept names ${accept.definiteLength} bytes against the proposed ${proposal.definiteLength} bytes`;
}

/** The lines each flavor's TH writes for the `ReceiveInit` it sent. */
function receiveInitLines(proposal: BdxTransferProposal) {
    return {
        matterjs: [new RegExp(`Message » for: BDX/ReceiveInit .* payload: ${receiveInitPayloadPrefix(proposal)}`)],
        chip: [
            /\[ATM\] ReceiveInit\s*$/,
            new RegExp(`\\[ATM\\]\\s+Proposed Transfer Control: ${chipProposedTransferControl(proposal)}\\s*$`),
            new RegExp(
                `\\[ATM\\]\\s+Range Control: ${chipRangeControl(proposal.definiteLength, proposal.startOffset)}\\s*$`,
            ),
            new RegExp(`\\[ATM\\]\\s+Proposed Max Block Size: ${proposal.maxBlockSize}\\s*$`),
            new RegExp(`\\[ATM\\]\\s+Start Offset: ${chipX64(proposal.startOffset)}\\s*$`),
            new RegExp(`\\[ATM\\]\\s+Proposed Max Length: ${chipX64(proposal.definiteLength)}\\s*$`),
        ],
    };
}

/** The lines each flavor's TH writes for the `ReceiveAccept` it took in. */
function receiveAcceptLines(accept: BdxTransferAccept) {
    return {
        matterjs: [new RegExp(`Message « for: BDX/ReceiveAccept .* payload: ${receiveAcceptPayload(accept)}\\s*$`)],
        chip: [
            /\[ATM\] ReceiveAccept\s*$/,
            new RegExp(
                `\\[ATM\\]\\s+Transfer Control: ${chipTransferControl(
                    accept.version,
                    accept.mode,
                    accept.asynchronousTransfer,
                )}\\s*$`,
            ),
            new RegExp(`\\[ATM\\]\\s+Range Control: ${chipRangeControl(accept.definiteLength)}\\s*$`),
            new RegExp(`\\[ATM\\]\\s+Max Block Size: ${accept.maxBlockSize}\\s*$`),
            new RegExp(`\\[ATM\\]\\s+Length: ${chipX64(accept.definiteLength)}\\s*$`),
        ],
    };
}

async function recordAcceptFields(cx: CertStepContext) {
    const { transfer, from } = transferOrFail();
    const { proposal, accept } = transfer;
    const th = cx.devices.th;

    await recordAll(cx, [
        {
            what: "Transfer Control names one of the proposed modes, at a version no newer than proposed",
            check: () => ({
                type: "response",
                verdict: modeProposed(proposal, accept) && accept.version <= proposal.version ? "pass" : "fail",
                detail:
                    `accept chose ${accept.mode} at version ${accept.version}; the initiator proposed ` +
                    `senderDrive=${proposal.senderDrive} receiverDrive=${proposal.receiverDrive} ` +
                    `asynchronousTransfer=${proposal.asynchronousTransfer} at version ${proposal.version}`,
            }),
        },
        {
            what: "Max Block Size is no larger than the proposed maximum",
            check: () => ({
                type: "response",
                verdict: accept.maxBlockSize <= proposal.maxBlockSize ? "pass" : "fail",
                detail: `accept granted ${accept.maxBlockSize} bytes against the proposed ${proposal.maxBlockSize}`,
            }),
        },
        {
            what: "Length, and with it Range Control's definite-length flag",
            check: () => ({
                type: "response",
                verdict: lengthConforms(proposal, accept) ? "pass" : "fail",
                detail: lengthDetail(proposal, accept),
            }),
        },
        {
            what: "the TH proposed the transfer the DUT answered",
            check: () =>
                expectSequence(
                    th.log,
                    th.flavor,
                    "BDX ReceiveInit the TH sent",
                    receiveInitLines(proposal),
                    from,
                    LOG_TIMEOUT,
                ),
        },
        {
            what: "the TH received the accept the DUT reports having sent",
            check: () =>
                expectSequence(
                    th.log,
                    th.flavor,
                    "BDX ReceiveAccept the TH received",
                    receiveAcceptLines(accept),
                    from,
                    LOG_TIMEOUT,
                ),
        },
    ]);
}

certTest("TC-BDX-1.4", {
    plan: "bdx.adoc",
    pics: ["MCORE.BDX.Sender", "MCORE.BDX.Responder"],
    app: "ota-requestor",
})
    .step(
        "0",
        "Precondition: the DUT commissions the TH, stages an OTA image for it and announces itself as the TH's " +
            "OTA provider, so the TH opens a BDX transfer the DUT answers as responder and sender.",
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
                "One BDX transfer runs to completion with the DUT as responder and sender. No plan step numbers " +
                "this: the plan's DUT is offered a transfer by other means, and an OTA announcement is how this " +
                "harness's controller comes to be offered one.",
        },
    )
    .step(
        1,
        "TH sends a ReceiveInit message to DUT + DUT sends a ReceiveAccept message back to TH. (11.21.5.4)",
        recordAcceptFields,
        {
            expected:
                "Verify that the ReceiveAccept message has the following mandatory fields. Transfer Control - " +
                "Exactly one mode shall be chosen out of the original proposed transfer methods sent by the " +
                "Initiator, and version shall be the newest version supported by Responder that is not newer than " +
                "the proposed version sent by the Initiator. Range Control. Max Block Size - Must be less than or " +
                "equal to the proposed max block size. Length - If this field is present, and the Initiator " +
                "indicated a definite length, this length shall either be: equal to the proposed definite length, " +
                "if the remaining data in the file beyond the Start Offset is larger or equal to the proposed " +
                "length; smaller than the proposed definite length, if the remaining data in the file beyond the " +
                "Start Offset is smaller than the proposed length. Metadata - Optional.",
        },
    )
    .finalize(cx => {
        served = undefined;
        return commissioned.decommissionAll(cx);
    });
