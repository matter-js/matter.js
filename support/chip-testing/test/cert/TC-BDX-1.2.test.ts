/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BdxTransferProposal, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { BdxTransferEvidence } from "./tc-bdx-support.js";
import {
    BDX_RECEIVER_ROLES,
    chipProposedTransferControl,
    chipRangeControl,
    chipX64,
    receiveInitPayloadPrefix,
    serveOtaTransfer,
    transferOrFail,
} from "./tc-bdx-support.js";
import { CommissionedRefs, expectSequence, LOG_TIMEOUT, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();

/** The one transfer this case reads, opened by the DUT in the precondition step. */
let served: BdxTransferEvidence | undefined;

/** The lines each flavor's DUT writes for the `ReceiveInit` it sent. */
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

async function recordProposalFields(cx: CertStepContext) {
    const { transfer, from } = transferOrFail(served);
    const { proposal } = transfer;
    const dut = cx.devices.dut;

    await recordAll(cx, [
        {
            // `BdxReceiveInitSchema.validate` refuses an init with neither drive bit, an empty file
            // designator or a zero Max Block Size, so a transfer existing at all settles that the
            // mandatory fields are present. What is left to check is what the DUT chose within them.
            what: "Proposed Transfer Control offers the receiver drive an OTA requestor needs",
            check: () => ({
                type: "response",
                verdict: proposal.receiverDrive && !proposal.asynchronousTransfer ? "pass" : "fail",
                detail:
                    `the DUT proposed senderDrive=${proposal.senderDrive} ` +
                    `receiverDrive=${proposal.receiverDrive} asynchronousTransfer=${proposal.asynchronousTransfer} ` +
                    `at version ${proposal.version}`,
            }),
        },
        {
            // The responder may only grant a block no larger than proposed, so a proposal the transfer
            // then exceeded is a proposal the DUT did not mean.
            what: "Proposed Max Block Size bounds the blocks the transfer carried",
            check: () => ({
                type: "response",
                verdict: transfer.accept.maxBlockSize <= proposal.maxBlockSize ? "pass" : "fail",
                detail:
                    `the DUT proposed ${proposal.maxBlockSize} bytes as the largest block it can take, ` +
                    `and the transfer ran at ${transfer.accept.maxBlockSize}`,
            }),
        },
        {
            what: "Range Control agrees with the optional fields the message carries",
            check: () => ({
                type: "response",
                verdict:
                    (proposal.startOffset === undefined || proposal.startOffset === 0) &&
                    proposal.definiteLength === undefined
                        ? "pass"
                        : "fail",
                detail:
                    `the DUT named ${proposal.startOffset === undefined ? "no start offset" : `start offset ${proposal.startOffset}`} ` +
                    `and ${proposal.definiteLength === undefined ? "an indefinite length" : `a definite length of ${proposal.definiteLength} bytes`}; ` +
                    "a requestor asks for the whole file and lets the provider state its size",
            }),
        },
        {
            // The designator is the path out of the image URI the provider answered QueryImage with,
            // and that URI names the version this run staged — so a DUT asking for anything else, or
            // replaying an earlier run's image, does not match what was offered.
            what: "File Designator names the image this run staged",
            check: () => ({
                type: "response",
                verdict:
                    proposal.fileDesignator.startsWith("ota/") &&
                    proposal.fileDesignator.endsWith(`.${transfer.softwareVersion}`)
                        ? "pass"
                        : "fail",
                detail:
                    `the DUT named a ${proposal.fileDesignatorLength}-byte file designator ` +
                    `"${proposal.fileDesignator}", for the software version ${transfer.softwareVersion} ` +
                    "the provider staged",
            }),
        },
        {
            what: "the DUT sent the ReceiveInit the TH answered",
            check: () =>
                expectSequence(
                    dut.log,
                    dut.flavor,
                    "BDX ReceiveInit the DUT sent",
                    receiveInitLines(proposal),
                    from,
                    LOG_TIMEOUT,
                ),
        },
    ]);
}

certTest("TC-BDX-1.2", {
    plan: "bdx.adoc",
    pics: ["MCORE.BDX.Receiver", "MCORE.BDX.Initiator"],
    app: "ota-requestor",
    ...BDX_RECEIVER_ROLES,
})
    .step(
        "0",
        "Precondition: the TH commissions the DUT, stages an OTA image for it and announces itself as the DUT's " +
            "OTA provider, so the DUT opens a BDX transfer with the ReceiveInit this case reads.",
        async cx => {
            const th = cx.controllers.th;
            const dut = cx.devices.dut;

            const ref = await th.commission({
                passcode: dut.commissioning.passcode,
                discriminator: dut.commissioning.discriminator,
            });
            commissioned.set("th", ref);

            served = await serveOtaTransfer(cx, ref, { sender: "th", receiver: "dut" });
        },
        {
            expected:
                "One BDX transfer runs to completion with the DUT as initiator and receiver. No plan step numbers " +
                "this: the plan's Notes verify this case through TC-SU-2.3, an OTA download, and an OTA " +
                "announcement is how this harness gives the DUT one to ask for.",
        },
    )
    .step(1, "DUT sends a ReceiveInit message to TH. (11.21.5.1)", recordProposalFields, {
        expected:
            "Verify that the ReceiveInit message has the following mandatory fields. Proposed Transfer " +
            "Control - At least one of the PTC[RECEIVER_DRIVE] or PTC[SENDER_DRIVE] field bits shall be set. " +
            "Range Control. Proposed Max Block Size. Start Offset - Optional. Proposed Max Length - Optional. " +
            "File Designator Length. File Designator. Metadata - Optional.",
    })
    .finalize(cx => {
        served = undefined;
        return commissioned.decommissionAll(cx);
    });
