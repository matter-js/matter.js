/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Seconds } from "@matter/main";
import type {
    BdxTransferAccept,
    BdxTransferProposal,
    CertDevice,
    CertStepContext,
    CheckRecord,
    ControllerAdapter,
    DeviceFlavor,
    LogFollower as LogFollowerType,
    OtaBdxTransfer,
    ServeOtaUpdateOptions,
} from "@matter/testing";
import { LineQueue, LogFollower, PicsFile } from "@matter/testing";
import { expect } from "chai";
import {
    blockAckEofSent,
    blockEofReceived,
    blockQueriesSent,
    blocksReceived,
    chipProposedTransferControl,
    chipRangeControl,
    chipTransferControl,
    chipX64,
    receiveAcceptPayload,
    receiveInitPayloadPrefix,
    serveOtaTransfer,
    unloggedByFlavor,
} from "../cert/tc-bdx-support.js";
import { CertCheckFailedError } from "../cert/tc-support.js";
import { fakeCertNode } from "./fake-cert-node.js";

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

const CHIP_DMG = "[1789855480.294] [4500:4500] [DMG] ";

/**
 * chip's own dump of one BDX message, copied from a `chip-ota-requestor-app` run's log: a received
 * Block, then the BlockQuery the requestor sent for the next one. `LogMessage` names neither.
 */
const CHIP_DUMP = [
    `${CHIP_DMG}<< from UDP:[fe80::1%eth0]:44141 | 93002293 | [Bulk Data Exchange  (2) / Block (0x11) / Session = 14676 / Exchange = 53116]`,
    `${CHIP_DMG}Header Flags =`,
    `${CHIP_DMG}Decrypted Payload (1028 bytes) =`,
    `${CHIP_DMG}{`,
    `${CHIP_DMG}    data = 00000000deadbeef`,
    `${CHIP_DMG}}`,
    `${CHIP_DMG}Data (1028 bytes) =`,
    `${CHIP_DMG}{`,
    `${CHIP_DMG}    BlockCounter = 7`,
    `${CHIP_DMG}    Data (853) = DEADBEEF`,
    `${CHIP_DMG}}`,
    `${CHIP_DMG}>> to UDP:[fe80::1%eth0]:44141 | 151936889 | [Bulk Data Exchange  (2) / Block Query (0x10) / Session = 58888 / Exchange = 53116]`,
    `${CHIP_DMG}Decrypted Payload (4 bytes) =`,
    `${CHIP_DMG}{`,
    `${CHIP_DMG}    data = 08000000`,
    `${CHIP_DMG}}`,
    `${CHIP_DMG}Data =`,
    `${CHIP_DMG}{`,
    `${CHIP_DMG}    BlockCounter = 8`,
    `${CHIP_DMG}}`,
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
        it("reads a message of a TCP session", async () => {
            // The trace line prefix copied from a chip-all-clusters-app TH log of a TCP session
            const log = await follower([
                `${CHIP_DMG}<< from TCP:[fe80::1c9d:1982:6732:a4a7%en0]:65282 | 19414371 | [Bulk Data Exchange  (2) / Block End Of File (0x12) / Session = 33364 / Exchange = 32761]`,
                `${CHIP_DMG}Decrypted Payload (107 bytes) =`,
                `${CHIP_DMG}    BlockCounter = 2`,
            ]);

            expect(blockEofReceived(log, "chip-local", 0)?.map(({ counter, length }) => [counter, length])).deep.equal([
                [2, 103],
            ]);
        });

        it("assembles the end of a transfer from the dump's two directions", async () => {
            const log = await follower([
                `${CHIP_DMG}<< from UDP:[fe80::1%eth0]:1 | 1 | [Bulk Data Exchange  (2) / Block End Of File (0x12) / Session = 1 / Exchange = 2]`,
                `${CHIP_DMG}Decrypted Payload (107 bytes) =`,
                `${CHIP_DMG}    BlockCounter = 2`,
                `${CHIP_DMG}>> to UDP:[fe80::1%eth0]:1 | 2 | [Bulk Data Exchange  (2) / Block Ack End Of File (0x14) / Session = 1 / Exchange = 2]`,
                `${CHIP_DMG}Decrypted Payload (4 bytes) =`,
                `${CHIP_DMG}    BlockCounter = 2`,
            ]);

            expect(blockEofReceived(log, "chip-local", 0)?.map(({ counter, length }) => [counter, length])).deep.equal([
                [2, 103],
            ]);
            expect(blockAckEofSent(log, "chip-local", 0)?.map(({ counter, length }) => [counter, length])).deep.equal([
                [2, undefined],
            ]);
        });

        it("refuses a message whose counter the dump does not carry", async () => {
            const log = await follower([
                `${CHIP_DMG}<< from UDP:[fe80::1%eth0]:1 | 1 | [Bulk Data Exchange  (2) / Block End Of File (0x12) / Session = 1 / Exchange = 2]`,
                `${CHIP_DMG}Decrypted Payload (107 bytes) =`,
            ]);

            expect(blockEofReceived(log, "chip-local", 0)).deep.equal([]);
        });

        it("does not read one message's counter as the next message's", async () => {
            const log = await follower([
                `${CHIP_DMG}<< from UDP:[fe80::1%eth0]:1 | 1 | [Bulk Data Exchange  (2) / Block End Of File (0x12) / Session = 1 / Exchange = 2]`,
                `${CHIP_DMG}<< from UDP:[fe80::1%eth0]:1 | 2 | [Bulk Data Exchange  (2) / Block End Of File (0x12) / Session = 1 / Exchange = 2]`,
                `${CHIP_DMG}Decrypted Payload (107 bytes) =`,
                `${CHIP_DMG}    BlockCounter = 9`,
            ]);

            expect(blockEofReceived(log, "chip-local", 0)?.map(({ counter }) => counter)).deep.equal([9]);
        });

        it("reads a Block and its size out of chip's own message dump", async () => {
            const log = await follower(CHIP_DUMP);

            // 1028 payload bytes less the four the block counter occupies
            expect(blocksReceived(log, "chip-local", 0)?.map(({ counter, length }) => [counter, length])).deep.equal([
                [7, 1024],
            ]);
        });

        it("counts a Block that arrived twice through an MRP retransmission once", async () => {
            const [header, ...fields] = CHIP_DUMP.slice(0, 11);
            const log = await follower([
                header,
                ...fields,
                header,
                ...fields,
                `${CHIP_DMG}<< from UDP:[fe80::1%eth0]:44141 | 93002293 | [Bulk Data Exchange  (2) / Block (0x11) / Session = 9999 / Exchange = 1]`,
                ...fields,
            ]);

            // The same message counter on another session is another message
            expect(blocksReceived(log, "chip-local", 0)?.map(({ counter }) => counter)).deep.equal([7, 7]);
        });

        it("reads a retransmitted Block whose first dump carried no counter", async () => {
            const [header, ...fields] = CHIP_DUMP.slice(0, 11);
            const log = await follower([header, `${CHIP_DMG}Decrypted Payload (1028 bytes) =`, header, ...fields]);

            expect(blocksReceived(log, "chip-local", 0)?.map(({ counter }) => counter)).deep.equal([7]);
        });

        it("reads a BlockQuery the receiver sent, which carries no data", async () => {
            const log = await follower(CHIP_DUMP);

            expect(blockQueriesSent(log, "chip-local", 0)?.map(({ counter, length }) => [counter, length])).deep.equal([
                [8, undefined],
            ]);
        });

        it("tells the two directions apart", async () => {
            const log = await follower(CHIP_DUMP);

            // The dump carries a Block the node received and a BlockQuery it sent; neither reader may
            // take the other's message for its own
            expect(blocksReceived(log, "chip-local", 0)).length(1);
            expect(blockQueriesSent(log, "chip-local", 0)).length(1);
        });

        it("states the gap for a flavor with no declaration at all", async () => {
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
            fileDesignator: "update-token",
            fileDesignatorLength: 12,
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

        it("writes no Length for the indefinite-length form, which is what a zero length is", () => {
            expect(receiveAcceptPayload({ ...RECEIVER_ACCEPT, definiteLength: 0 })).equal("20000004");
            expect(receiveInitPayloadPrefix({ ...RECEIVER_PROPOSAL, definiteLength: 0 })).equal("20000004");
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

        it("keeps both modes a proposal offers, where an accept names one", () => {
            const proposal: BdxTransferProposal = {
                version: 0,
                senderDrive: false,
                receiverDrive: true,
                asynchronousTransfer: false,
                maxBlockSize: 1024,
                fileDesignator: "update-token",
                fileDesignatorLength: 12,
            };
            expect(chipProposedTransferControl(proposal)).equal("0x20");
            expect(chipProposedTransferControl({ ...proposal, senderDrive: true })).equal("0x30");
        });

        it("prints a 64-bit value as sixteen zero-padded uppercase digits", () => {
            expect(chipX64(undefined)).equal("0x0000000000000000");
            expect(chipX64(0x10065)).equal("0x0000000000010065");
        });
    });
});

describe("serveOtaTransfer", () => {
    const CHIP_ACK_EOF = [
        "[1789855480.294] [4500:4500] [ATM] BlockAckEOF",
        "[1789855480.294] [4500:4500] [ATM]   Block Counter: 3",
    ];
    const CHIP_DOWNLOADED = "[1789855480.301] [4500:4500] [SWU] OTA image downloaded to /tmp/chip_ota_image.bin";
    const MATTERJS_ACK_EOF =
        "2026-09-19 11:35:14.017 DEBUG MessageChannel Message » for: BDX/BlockAckEof cnt: 2 ackLen: 103 id: @1:5bfb•bd type: 0x14/0x14";

    function transferWith(overrides: Partial<OtaBdxTransfer> = {}): OtaBdxTransfer {
        return {
            providerEndpoint: 0,
            providerNodeId: "1",
            softwareVersion: 2,
            fileSize: 65536,
            proposal: {
                version: 0,
                senderDrive: false,
                receiverDrive: true,
                asynchronousTransfer: false,
                maxBlockSize: 1024,
                fileDesignator: "ota",
                fileDesignatorLength: 3,
            },
            accept: { version: 0, mode: "receiverDrive", asynchronousTransfer: false, maxBlockSize: 1024 },
            transferredBytes: 65536,
            applyAcknowledged: false,
            observedMs: 0,
            exchanges: { queryImage: [], applyUpdate: [], notifyUpdateApplied: [] },
            ...overrides,
        };
    }

    /**
     * Runs the precondition against a receiver that writes `receiverLines` while the sender serves, and returns what
     * it recorded, what it asked the sender for, and the error it ended with.
     */
    async function run(
        flavor: DeviceFlavor,
        receiverLines: string[],
        transfer: OtaBdxTransfer,
        roles: { expectApply?: boolean; timeoutMs?: number } = {},
    ) {
        const source = new LineQueue();
        const log = new LogFollower(source.follow(), "receiver");
        const receiver: CertDevice = {
            id: "receiver",
            app: "ota-requestor",
            commissioning: { kind: "on-network", passcode: 20202021, discriminator: 3840, qrPairingCode: "" },
            pics: new PicsFile([]),
            async initialize() {},
            async start() {},
            async stop() {},
            async close() {},
            async snapshot() {
                return {};
            },
            async restore() {},
            async backchannel() {},
            flavor,
            log,
            exit: new Promise(() => {}),
        };

        const served = new Array<ServeOtaUpdateOptions>();
        const sender: ControllerAdapter = {
            id: "sender",
            log: new LogFollower(new LineQueue().follow(), "sender"),
            async start() {},
            async close() {},
            async commission() {
                throw new InternalError("not used by these tests");
            },
            async parseQrPayload() {
                throw new InternalError("not used by these tests");
            },
            async parseManualPairingCode(): Promise<never> {
                throw new InternalError("not used by these tests");
            },
            group(): never {
                throw new InternalError("not used by these tests");
            },
            node: () =>
                fakeCertNode({
                    async serveOtaUpdate(options) {
                        served.push(options ?? {});
                        for (const line of receiverLines) {
                            source.push(line);
                        }
                        source.close();
                        return transfer;
                    },
                }),
        };

        const checks = new Array<CheckRecord>();
        const cx: CertStepContext = {
            controllers: { th: sender },
            devices: { dut: receiver },
            recorder: {
                beginStep() {},
                check(record) {
                    checks.push(record);
                },
                endStep() {
                    return [];
                },
                async flush() {
                    return "";
                },
            },
            controllerSelection: { dut: "matterjs", helper: "matterjs" },
            deviceFlavor: undefined,
            picsMet: () => {
                throw new InternalError("not used by these tests");
            },
        };

        let error: unknown;
        try {
            await serveOtaTransfer(cx, "1", { sender: "th", receiver: "dut", ...roles });
        } catch (e) {
            error = e;
        }
        return { checks, served, error };
    }

    it("takes a chip receiver's download line as the end of an update it was not asked to apply", async () => {
        const { checks, served, error } = await run("chip-local", [...CHIP_ACK_EOF, CHIP_DOWNLOADED], transferWith(), {
            expectApply: false,
        });

        expect(error).equal(undefined);
        expect(served.map(options => options.expectApply)).deep.equal([false]);
        expect(checks.map(check => check.verdict)).deep.equal(["pass", "pass", "pass"]);
        expect(checks[2]).deep.include({ type: "device-log", pattern: "the DUT ended the update at the download" });
        expect(checks[2].matched).contain("OTA image downloaded to /tmp/chip_ota_image.bin");
    });

    it("fails a chip receiver that never wrote its download line", async () => {
        const { checks, error } = await run("chip-local", CHIP_ACK_EOF, transferWith(), { expectApply: false });

        expect(error).instanceOf(CertCheckFailedError);
        expect(checks[2]).deep.include({ type: "device-log", verdict: "fail" });
        expect(String(error)).contain("the DUT finished the OTA exchange the transfer belongs to");
    });

    it("expects a chip receiver to end at the download, and a matter.js one to ask to apply, unless told otherwise", async () => {
        const chip = await run("chip-local", [...CHIP_ACK_EOF, CHIP_DOWNLOADED], transferWith());
        expect(chip.served.map(options => options.expectApply)).deep.equal([false]);
        expect(chip.error).equal(undefined);

        const matterJs = await run("matterjs", [MATTERJS_ACK_EOF], transferWith({ applyAcknowledged: true }));
        expect(matterJs.served.map(options => options.expectApply)).deep.equal([true]);
        expect(matterJs.error).equal(undefined);

        const chipApplying = await run("chip-local", CHIP_ACK_EOF, transferWith({ applyAcknowledged: true }), {
            expectApply: true,
        });
        expect(chipApplying.served.map(options => options.expectApply)).deep.equal([true]);
    });

    it("passes a receiver that asked to apply and the sender allowed it", async () => {
        const { checks, error } = await run("matterjs", [MATTERJS_ACK_EOF], transferWith({ applyAcknowledged: true }));

        expect(error).equal(undefined);
        expect(checks[2]).deep.include({
            type: "response",
            verdict: "pass",
            detail: "the DUT asked to apply the image and the TH allowed it",
        });
    });

    it("records, without failing, a receiver that had not asked to apply when the sender stopped waiting", async () => {
        const { checks, error } = await run("matterjs", [MATTERJS_ACK_EOF], transferWith({ applyAcknowledged: false }));

        expect(error).equal(undefined);
        expect(checks[2].verdict).equal("unverified");
        expect(checks[2].accepted).contain("the DUT had not asked to apply the image when the TH stopped waiting");
    });

    it("hands the sender its budget, the shorter default or the case's own", async () => {
        const byDefault = await run("matterjs", [MATTERJS_ACK_EOF], transferWith());
        expect(byDefault.served.map(options => options.timeoutMs)).deep.equal([Seconds(60)]);

        const own = await run("matterjs", [MATTERJS_ACK_EOF], transferWith(), { timeoutMs: 123_000 });
        expect(own.served.map(options => options.timeoutMs)).deep.equal([123_000]);
    });
});
