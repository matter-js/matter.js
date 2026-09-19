/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { BdxTransferEvidence } from "./tc-bdx-support.js";
import {
    BDX_RECEIVER_ROLES,
    blockAckEofSent,
    blockQueriesSent,
    blocksReceived,
    overMessages,
    serveOtaTransfer,
    transferOrFail,
} from "./tc-bdx-support.js";
import { CommissionedRefs, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();

/** The one transfer this case reads, received by the DUT in the precondition step. */
let served: BdxTransferEvidence | undefined;

async function firstBlockAcknowledged(cx: CertStepContext) {
    const { transfer, from } = transferOrFail(served);
    const dut = cx.devices.dut;

    await recordAll(cx, [
        {
            what: "the first Block the DUT received",
            check: () =>
                overMessages(
                    blocksReceived(dut.log, dut.flavor, from),
                    "the Blocks the DUT received",
                    "TransferSession::HandleBlock",
                    blocks => {
                        const [first] = blocks;
                        return {
                            ok:
                                first?.counter === 0 &&
                                first.length !== undefined &&
                                first.length > 0 &&
                                first.length <= transfer.accept.maxBlockSize,
                            detail:
                                first === undefined
                                    ? "the DUT logged no Block messages"
                                    : `the first Block carries counter ${first.counter} and ${first.length} bytes, ` +
                                      `against a negotiated Max Block Size of ${transfer.accept.maxBlockSize}`,
                        };
                    },
                ),
        },
        {
            // The plan's "BlockAck" is the sender-drive form of this exchange. The transfer negotiated
            // receiver drive, where the receiver's query for the next block is what acknowledges the
            // last, so that is the message recorded here.
            what: "the DUT acknowledged the first Block",
            check: () =>
                overMessages(
                    blockQueriesSent(dut.log, dut.flavor, from),
                    "a BlockQuery the DUT sent",
                    "TransferSession::PrepareBlockQuery",
                    queries => {
                        const answer = queries[1];
                        return {
                            ok: answer?.counter === 1,
                            detail:
                                answer === undefined
                                    ? `the DUT sent ${queries.length} BlockQuery messages, so none answered the first Block`
                                    : `under ${transfer.accept.mode} the DUT answered the first Block with a ` +
                                      `BlockQuery naming block ${answer.counter}`,
                        };
                    },
                ),
        },
    ]);
}

async function firstQuery(cx: CertStepContext) {
    const { from } = transferOrFail(served);
    const dut = cx.devices.dut;

    await recordAll(cx, [
        {
            what: "the first BlockQuery the DUT sent counts from zero",
            check: () =>
                overMessages(
                    blockQueriesSent(dut.log, dut.flavor, from),
                    "the BlockQuery messages the DUT sent",
                    "TransferSession::PrepareBlockQuery",
                    queries => {
                        const [first] = queries;
                        return {
                            ok: first?.counter === 0,
                            detail:
                                first === undefined
                                    ? "the DUT logged no BlockQuery messages"
                                    : `the first BlockQuery names block ${first.counter}`,
                        };
                    },
                ),
        },
    ]);
}

async function furtherQueries(cx: CertStepContext) {
    const { from } = transferOrFail(served);
    const dut = cx.devices.dut;

    await recordAll(cx, [
        {
            what: "the BlockQuery messages ascend in sequence",
            check: () =>
                overMessages(
                    blockQueriesSent(dut.log, dut.flavor, from),
                    "the BlockQuery messages the DUT sent",
                    "TransferSession::PrepareBlockQuery",
                    queries => {
                        if (queries.length < 2) {
                            return {
                                ok: false,
                                detail: `the DUT logged ${queries.length} BlockQuery messages, so none followed`,
                            };
                        }
                        const outOfOrder = queries.findIndex((query, index) => query.counter !== index);
                        return {
                            ok: outOfOrder === -1,
                            detail:
                                outOfOrder === -1
                                    ? `${queries.length} BlockQuery messages with counters 0..${queries.length - 1}`
                                    : `BlockQuery ${outOfOrder} of ${queries.length} carries counter ${queries[outOfOrder].counter}`,
                        };
                    },
                ),
        },
    ]);
}

async function blockEofAcknowledged(cx: CertStepContext) {
    const { transfer, from } = transferOrFail(served);
    const dut = cx.devices.dut;
    const { maxBlockSize } = transfer.accept;

    // Counted from the size the sender staged, which neither of the messages under test supplies: a
    // length read back off one of them would leave the counter on it compared against itself.
    const expectedCounter = Math.floor(transfer.fileSize / maxBlockSize);
    const counterDerivation = `${expectedCounter} from a ${transfer.fileSize}-byte image at ${maxBlockSize} bytes a block`;

    await recordAll(cx, [
        {
            what: "the BlockAckEOF the DUT sent names the BlockEOF's counter",
            check: () =>
                overMessages(
                    blockAckEofSent(dut.log, dut.flavor, from),
                    "the BlockAckEOF the DUT sent",
                    "TransferSession::PrepareBlockAck",
                    acks => ({
                        ok:
                            acks.length === 1 &&
                            Number.isInteger(expectedCounter) &&
                            acks[0].counter === expectedCounter,
                        detail:
                            `the DUT sent ${acks.length} BlockAckEOF messages` +
                            (acks.length === 1 ? ` naming block ${acks[0].counter}` : "") +
                            `, against an expected ${counterDerivation}`,
                    }),
                ),
        },
        {
            what: "the whole file reached the DUT",
            check: () => ({
                type: "response",
                verdict: transfer.transferredBytes === transfer.fileSize ? "pass" : "fail",
                detail: `the TH transferred ${transfer.transferredBytes} of the ${transfer.fileSize} bytes it staged`,
            }),
        },
    ]);
}

certTest("TC-BDX-2.2", {
    plan: "bdx.adoc",
    pics: ["MCORE.BDX.SynchronousReceiver"],
    app: "ota-requestor",
    ...BDX_RECEIVER_ROLES,
})
    .step(
        "0",
        "Precondition: the TH commissions the DUT, stages an OTA image for it and announces itself as the DUT's " +
            "OTA provider, so the DUT opens a BDX transfer and receives the image over it.",
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
                "One synchronous BDX transfer runs to completion with the DUT as receiver. The plan's Test Setup " +
                "lets either party open it; here the DUT does, with a ReceiveInit, which is what an OTA requestor " +
                "sends its provider. The steps below read that one transfer rather than driving one each.",
        },
    )
    .step(
        1,
        "TH sends the first Block message to DUT + DUT sends a BlockAck message back to TH. (11.21.6.6)",
        firstBlockAcknowledged,
        {
            expected:
                "Verify that the BlockAck message has the following mandatory fields. Block Counter - Must " +
                "correspond to the Block Counter which was embedded in the Block being acknowledged.",
        },
    )
    .step(
        2,
        "DUT sends the first BlockQuery message to TH + TH sends a Block message back to DUT. (11.21.6.2)",
        firstQuery,
        {
            pics: "MCORE.BDX.Driver",
            expected:
                "Verify that the BlockQuery message has the following mandatory fields. Block Counter - Must " +
                "start at 0 at the start of the transfer.",
        },
    )
    .step(
        3,
        "DUT sends further BlockQuery messages to TH + TH sends further Block messages back to DUT. (11.21.6.2)",
        furtherQueries,
        {
            pics: "MCORE.BDX.Driver",
            expected: "Verify that the BlockQuery messages are sent in ascending and sequential block counter order.",
        },
    )
    .step(
        4,
        "DUT sends a BlockQueryWithSkip message to TH + TH sends a Block message back to DUT. (11.21.6.3)",
        async () => {
            throw new InternalError("A step declared notApplicable was run");
        },
        {
            // Not a PICS gate: a receiver sends BlockQueryWithSkip to resume a transfer past bytes it
            // already holds, and the OTA download this case rests on runs once from the start. The
            // step would be unreachable here even on a receiver that does send one.
            notApplicable:
                "the single uninterrupted OTA download this case reads never asks the sender to skip " +
                "bytes, and matter.js's receiver sends no BlockQueryWithSkip at all",
            expected:
                "Verify that the BlockQueryWithSkip message has the following mandatory fields. Block Counter. " +
                "BytesToSkip.",
        },
    )
    .step(
        5,
        "TH sends a BlockEOF message to DUT + DUT sends a BlockAckEOF message back to TH. (11.21.6.7)",
        blockEofAcknowledged,
        {
            expected:
                "Verify that the BlockAckEOF message has the following mandatory fields. Block Counter - Must " +
                "correspond to the Block Counter which was embedded in the BlockEOF being acknowledged.",
        },
    )
    .finalize(cx => {
        served = undefined;
        return commissioned.decommissionAll(cx);
    });
