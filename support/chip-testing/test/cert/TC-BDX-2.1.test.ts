/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext, CheckRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { BdxMessageRecord, BdxTransferEvidence } from "./tc-bdx-support.js";
import {
    blockAckEofSent,
    blockEofReceived,
    blockQueriesSent,
    blocksReceived,
    serveOtaTransfer,
    unloggedByFlavor,
} from "./tc-bdx-support.js";
import { CertCheckFailedError, CommissionedRefs, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** The one transfer this case reads, served by the precondition step. */
let served: BdxTransferEvidence | undefined;

function transferOrFail(): BdxTransferEvidence {
    if (served === undefined) {
        throw new CertCheckFailedError("the precondition step served no BDX transfer for this step to read");
    }
    return served;
}

/** A device-log check over messages the TH logged, or the flavor's declared gap where it logs none. */
function overMessages(
    messages: BdxMessageRecord[] | undefined,
    what: string,
    source: string,
    judge: (messages: BdxMessageRecord[]) => { ok: boolean; detail: string },
): CheckRecord {
    if (messages === undefined) {
        return unloggedByFlavor(what, source);
    }
    const { ok, detail } = judge(messages);
    return {
        type: "device-log",
        verdict: ok ? "pass" : "fail",
        pattern: what,
        detail,
        matched: messages[0]?.line,
        logLine: messages[0]?.index,
    };
}

async function firstBlock(cx: CertStepContext) {
    const { transfer, from } = transferOrFail();
    const th = cx.devices.th;
    const { maxBlockSize } = transfer.accept;

    await recordAll(cx, [
        {
            what: "the DUT's own account of the transfer it sent",
            check: () => ({
                type: "response",
                verdict: transfer.transferredBytes > 0 ? "pass" : "fail",
                detail:
                    `DUT sent ${transfer.transferredBytes} bytes of a ${transfer.fileSize}-byte image in blocks of ` +
                    `at most the negotiated ${maxBlockSize} bytes`,
            }),
        },
        {
            what: "the first Block the TH received",
            check: () =>
                overMessages(
                    blocksReceived(th.log, th.flavor, from),
                    "a Block the TH received",
                    "TransferSession::HandleBlock",
                    blocks => {
                        const first = blocks[0];
                        if (first === undefined) {
                            return { ok: false, detail: "the TH logged no Block at all" };
                        }
                        const length = first.length ?? 0;
                        return {
                            ok: first.counter === 0 && length > 0 && length <= maxBlockSize,
                            detail:
                                `first Block counter ${first.counter}, data length ${length} bytes, against a ` +
                                `negotiated Max Block Size of ${maxBlockSize}`,
                        };
                    },
                ),
        },
        {
            what: "the TH's answer to the first Block",
            check: () =>
                overMessages(
                    blockQueriesSent(th.log, th.flavor, from),
                    "a BlockQuery the TH sent",
                    "TransferSession::PrepareBlockQuery",
                    queries => {
                        // The transfer negotiated receiver drive, where the receiver's own query for the
                        // next block is what acknowledges the last one; the plan's "BlockAck" names the
                        // sender-drive form of the same exchange. The first query asked for block 0, so
                        // the one answering the first Block is the second.
                        const answer = queries[1];
                        return {
                            ok: answer?.counter === 1,
                            detail:
                                answer === undefined
                                    ? `the TH sent ${queries.length} BlockQuery messages, so none answered the first Block`
                                    : `under ${transfer.accept.mode} the TH answered the first Block with a ` +
                                      `BlockQuery naming block ${answer.counter}`,
                        };
                    },
                ),
        },
    ]);
}

async function furtherBlocks(cx: CertStepContext) {
    const { transfer, from } = transferOrFail();
    const th = cx.devices.th;

    // One `recordAll`, not a `record` each: the step claims the ordering and the size, and a per-check
    // `record` would drop the size on an ordering failure — exactly the path the evidence is for.
    await recordAll(cx, [
        {
            what: "the Blocks after the first are ascending and sequential",
            check: () =>
                overMessages(
                    blocksReceived(th.log, th.flavor, from),
                    "the Blocks the TH received",
                    "TransferSession::HandleBlock",
                    blocks => {
                        if (blocks.length < 2) {
                            return {
                                ok: false,
                                detail: `the TH logged ${blocks.length} Block messages, so none followed`,
                            };
                        }
                        const outOfOrder = blocks.findIndex((block, index) => block.counter !== index);
                        return {
                            ok: outOfOrder === -1,
                            detail:
                                outOfOrder === -1
                                    ? `${blocks.length} Blocks with counters 0..${blocks.length - 1}, ascending and sequential`
                                    : `Block ${outOfOrder} of ${blocks.length} carries counter ${blocks[outOfOrder].counter}`,
                        };
                    },
                ),
        },
        {
            what: "the DUT sent more than one block",
            check: () => ({
                type: "response" as const,
                verdict:
                    transfer.transferredBytes > transfer.accept.maxBlockSize ? ("pass" as const) : ("fail" as const),
                detail:
                    `the DUT sent ${transfer.transferredBytes} bytes, more than the ${transfer.accept.maxBlockSize} ` +
                    "bytes one block carries, so blocks followed the first",
            }),
        },
    ]);
}

async function blockEof(cx: CertStepContext) {
    const { transfer, from } = transferOrFail();
    const th = cx.devices.th;
    const { maxBlockSize } = transfer.accept;

    // Counted from the bytes the DUT sent, so that the BlockEOF and its acknowledgement are both
    // compared against a number neither of them supplied
    const eofLength = blockEofReceived(th.log, th.flavor, from)?.[0]?.length ?? 0;
    const expectedCounter = (transfer.transferredBytes - eofLength) / maxBlockSize;
    const counterDerivation = `${expectedCounter} from ${transfer.transferredBytes} bytes transferred at ${maxBlockSize} bytes a block`;

    await recordAll(cx, [
        {
            what: "the BlockEOF the TH received",
            check: () =>
                overMessages(
                    blockEofReceived(th.log, th.flavor, from),
                    "the BlockEOF the TH received",
                    "TransferSession::HandleBlockEOF",
                    eofs => {
                        if (eofs.length !== 1) {
                            return { ok: false, detail: `the TH logged ${eofs.length} BlockEOF messages, expected 1` };
                        }
                        const [eof] = eofs;
                        const length = eof.length ?? 0;
                        return {
                            ok:
                                Number.isInteger(expectedCounter) &&
                                eof.counter === expectedCounter &&
                                length <= maxBlockSize,
                            detail:
                                `BlockEOF counter ${eof.counter} (expected ${counterDerivation}), ` +
                                `data length ${length} bytes`,
                        };
                    },
                ),
        },
        {
            what: "the BlockAckEOF the TH sent",
            check: () =>
                overMessages(
                    blockAckEofSent(th.log, th.flavor, from),
                    "the BlockAckEOF the TH sent",
                    "TransferSession::PrepareBlockAck",
                    acks => ({
                        ok:
                            acks.length === 1 &&
                            Number.isInteger(expectedCounter) &&
                            acks[0].counter === expectedCounter,
                        detail:
                            `the TH sent ${acks.length} BlockAckEOF messages` +
                            (acks.length === 1 ? ` naming block ${acks[0].counter}` : "") +
                            `, against an expected ${counterDerivation}`,
                    }),
                ),
        },
        {
            what: "the whole file was transferred",
            check: () => ({
                type: "response",
                verdict: transfer.transferredBytes === transfer.fileSize ? "pass" : "fail",
                detail:
                    `the DUT transferred ${transfer.transferredBytes} of the ${transfer.fileSize} bytes it staged` +
                    (transfer.accept.definiteLength === undefined
                        ? "; the accept named no definite length, so the size is the DUT's own"
                        : `, and the accept named ${transfer.accept.definiteLength} bytes`),
            }),
        },
    ]);
}

certTest("TC-BDX-2.1", {
    plan: "bdx.adoc",
    pics: ["MCORE.BDX.SynchronousSender"],
    app: "ota-requestor",
})
    .step(
        "0",
        "Precondition: the DUT commissions the TH, stages an OTA image for it and announces itself as the TH's " +
            "OTA provider, so the TH opens a BDX transfer the DUT then sends the image over.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            served = await serveOtaTransfer(cx, ref);
        },
        {
            expected:
                "One synchronous BDX transfer runs to completion with the DUT as sender. The plan's Test Setup " +
                "lets either party open it; here the TH does, with a ReceiveInit, which is what an OTA requestor " +
                "sends its provider. The three steps below read that one transfer rather than driving one each.",
        },
    )
    .step(
        1,
        "DUT sends the first Block message to TH + TH sends a BlockAck message back to DUT. (11.21.6.4)",
        async cx => firstBlock(cx),
        {
            expected:
                "Verify that the Block message has the following mandatory fields. Block Counter - Must start at " +
                "0 at the start of the transfer. Data - The length must be in the range [0 < Length <= Max Block " +
                "Size], where Max Block Size is the negotiated Max Block Size matching the SendAccept message " +
                "that initiated the transfer.",
        },
    )
    .step(
        2,
        "DUT sends further Block messages to TH + TH sends BlockAck messages back to DUT. (11.21.6.4)",
        async cx => furtherBlocks(cx),
        { expected: "Verify that the Blocks are sent in ascending and sequential block counter order." },
    )
    .step(
        3,
        "DUT sends a BlockEOF message to TH + TH sends a BlockAckEOF message back to DUT. (11.21.6.5)",
        async cx => blockEof(cx),
        {
            expected:
                "Verify that the BlockEOF message has the following mandatory fields. Block Counter. Data - The " +
                "length must be in the range [0 <= Length <= Max Block Size], where Max Block Size is the " +
                "negotiated Max Block Size matching the SendAccept message that initiated the transfer. Verify " +
                "that the pre-negotiated file size was transferred, if a definite size had been given.",
        },
    )
    .finalize(cx => {
        served = undefined;
        return commissioned.decommissionAll(cx);
    });
