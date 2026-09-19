/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BdxTransferAccept, BdxTransferProposal, LogFollower as LogFollowerType } from "@matter/testing";
import { LineQueue, LogFollower } from "@matter/testing";
import {
    blockAckEofSent,
    blockEofReceived,
    blockQueriesSent,
    blocksReceived,
    chipRangeControl,
    chipTransferControl,
    chipX64,
    receiveAcceptPayload,
    receiveInitPayloadPrefix,
    unloggedByFlavor,
} from "../cert/tc-bdx-support.js";

/**
 * A follower over lines that are all already present.
 *
 * The BDX readers scan the buffer rather than waiting on it, so a test's lines have to be ingested
 * before it reads them — which is what the transfer's own completion guarantees in a real run.
 */
async function follower(lines: string[]): Promise<LogFollowerType> {
    const source = new LineQueue();
    for (const line of lines) {
        source.push(line);
    }
    source.close();

    const log = new LogFollower(source.follow(), "th");
    await log.settled();
    return log;
}

/**
 * matter.js's own lines for a receiver taking in two blocks and the end of the transfer, as a real run
 * writes them.
 *
 * A receiver's own messages carry what it took: an inbound message is logged as it arrives, before BDX
 * decodes it, so a `Block` line names no counter and the query that follows reports the block before it.
 */
const MATTERJS_TRANSFER = [
    "2026-09-19 11:35:13.900 DEBUG MessageChannel Message » for: BDX/BlockQuery cnt: 0 id: @1:5bfb•b7 type: 0x14/0x10",
    "2026-09-19 11:35:13.910 DEBUG MessageChannel Message « for: BDX/Block id: @1:5bfb•b8 type: 0x14/0x11",
    "2026-09-19 11:35:13.945 DEBUG MessageChannel Message » for: BDX/BlockQuery cnt: 1 rcvdCnt: 0 rcvdLen: 1024 id: @1:5bfb•b9 type: 0x14/0x10",
    "2026-09-19 11:35:13.950 DEBUG MessageChannel Message « for: BDX/Block id: @1:5bfb•ba type: 0x14/0x11",
    "2026-09-19 11:35:13.990 DEBUG MessageChannel Message » for: BDX/BlockQuery cnt: 2 rcvdCnt: 1 rcvdLen: 1024 id: @1:5bfb•bb type: 0x14/0x10",
    "2026-09-19 11:35:14.010 DEBUG MessageChannel Message « for: BDX/BlockEof id: @1:5bfb•bc type: 0x14/0x12",
    "2026-09-19 11:35:14.017 DEBUG MessageChannel Message » for: BDX/BlockAckEof cnt: 2 ackLen: 103 id: @1:5bfb•bd type: 0x14/0x14",
];

const CHIP_PREFIX = "[1786133143.490] [61784:1234567:chip] [ATM] ";

/** chip's own lines for the two messages its receiver logs, as `LogMessage` prints them. */
const CHIP_TRANSFER = [
    `${CHIP_PREFIX}BlockEOF`,
    `${CHIP_PREFIX}  Block Counter: 2`,
    `${CHIP_PREFIX}  Data Length: 103`,
    "[1786133143.491] [61784:1234567:chip] [BDX] Stop polling for messages",
    `${CHIP_PREFIX}Sending BDX Message`,
    `${CHIP_PREFIX}BlockAckEOF`,
    `${CHIP_PREFIX}  Block Counter: 2`,
];

describe("tc-bdx-support", () => {
    describe("messages a matterjs TH logged", () => {
        it("reports each Block's counter and data length", async () => {
            const log = await follower(MATTERJS_TRANSFER);

            expect(blocksReceived(log, "matterjs", 0)?.map(({ counter, length }) => [counter, length])).deep.equal([
                [0, 1024],
                [1, 1024],
            ]);
        });

        it("reports the BlockEOF apart from the Blocks", async () => {
            const log = await follower(MATTERJS_TRANSFER);

            expect(blockEofReceived(log, "matterjs", 0)?.map(({ counter, length }) => [counter, length])).deep.equal([
                [2, 103],
            ]);
            expect(blockAckEofSent(log, "matterjs", 0)?.map(({ counter }) => counter)).deep.equal([2]);
        });

        it("reports the queries the receiver sent, which is how it answers under receiver drive", async () => {
            const log = await follower(MATTERJS_TRANSFER);

            expect(blockQueriesSent(log, "matterjs", 0)?.map(({ counter }) => counter)).deep.equal([0, 1, 2]);
        });

        it("ignores what precedes the cursor", async () => {
            const log = await follower(MATTERJS_TRANSFER);

            expect(blocksReceived(log, "matterjs", 3)?.map(({ counter }) => counter)).deep.equal([1]);
        });
    });

    describe("messages a chip TH logged", () => {
        it("assembles a message from the name line and the fields under it", async () => {
            const log = await follower(CHIP_TRANSFER);

            expect(blockEofReceived(log, "chip-local", 0)?.map(({ counter, length }) => [counter, length])).deep.equal([
                [2, 103],
            ]);
            expect(blockAckEofSent(log, "chip-local", 0)?.map(({ counter, length }) => [counter, length])).deep.equal([
                [2, undefined],
            ]);
        });

        it("refuses a message whose fields are not where LogMessage puts them", async () => {
            const log = await follower([
                `${CHIP_PREFIX}BlockEOF`,
                "[1786133143.491] [61784:1234567:chip] [BDX] Stop polling for messages",
                `${CHIP_PREFIX}  Block Counter: 2`,
                `${CHIP_PREFIX}  Data Length: 103`,
            ]);

            expect(blockEofReceived(log, "chip-local", 0)).deep.equal([]);
        });

        it("refuses a message whose data length is missing", async () => {
            const log = await follower([`${CHIP_PREFIX}BlockEOF`, `${CHIP_PREFIX}  Block Counter: 2`]);

            expect(blockEofReceived(log, "chip-local", 0)).deep.equal([]);
        });

        it("states the gap for a message chip logs nothing for", async () => {
            const log = await follower(CHIP_TRANSFER);

            expect(blocksReceived(log, "chip-local", 0)).equal(undefined);
            expect(blockQueriesSent(log, "chip-local", 0)).equal(undefined);

            const gap = unloggedByFlavor("a Block the TH received", "TransferSession::HandleBlock");
            expect(gap.verdict).equal("unverified");
            expect(gap.accepted).contains("TransferSession::HandleBlock");
        });
    });

    describe("the bytes a message encodes to", () => {
        const RECEIVER_PROPOSAL: BdxTransferProposal = {
            version: 0,
            senderDrive: false,
            receiverDrive: true,
            asynchronousTransfer: false,
            maxBlockSize: 1024,
        };

        const RECEIVER_ACCEPT: BdxTransferAccept = {
            version: 0,
            mode: "receiverDrive",
            asynchronousTransfer: false,
            maxBlockSize: 1024,
        };

        it("renders the ReceiveInit an OTA requestor sends", () => {
            // Captured from a matterjs TH: transfer control 0x20, no range flags, 1024 little-endian
            expect(receiveInitPayloadPrefix(RECEIVER_PROPOSAL)).equal("20000004");
        });

        it("renders the ReceiveAccept a matter.js provider answers with", () => {
            expect(receiveAcceptPayload(RECEIVER_ACCEPT)).equal("20000004");
        });

        it("names the fields a definite length and a start offset add", () => {
            expect(receiveInitPayloadPrefix({ ...RECEIVER_PROPOSAL, startOffset: 1, definiteLength: 0x10065 })).equal(
                "20030004" + "01000000" + "65000100",
            );
            expect(receiveAcceptPayload({ ...RECEIVER_ACCEPT, definiteLength: 0x10065 })).equal("2001000465000100");
        });

        it("distinguishes a mode and a version", () => {
            expect(receiveAcceptPayload({ ...RECEIVER_ACCEPT, mode: "senderDrive" })).equal("10000004");
            expect(receiveAcceptPayload({ ...RECEIVER_ACCEPT, version: 1 })).equal("21000004");
            expect(receiveAcceptPayload({ ...RECEIVER_ACCEPT, asynchronousTransfer: true })).equal("60000004");
        });
    });

    describe("chip's own rendering of those bytes", () => {
        it("prints a byte with %X, which pads to nothing", () => {
            expect(chipTransferControl(0, "receiverDrive", false)).equal("0x20");
            expect(chipTransferControl(0, "senderDrive", true)).equal("0x50");
            expect(chipRangeControl(undefined)).equal("0x0");
            expect(chipRangeControl(1024)).equal("0x1");
            expect(chipRangeControl(1024, 16)).equal("0x3");
        });

        it("prints a 64-bit value as sixteen zero-padded uppercase digits", () => {
            expect(chipX64(undefined)).equal("0x0000000000000000");
            expect(chipX64(0x10065)).equal("0x0000000000010065");
        });
    });
});
