/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/main";
import { UnsupportedByControllerError } from "@matter/testing";
import type {
    BdxTransferAccept,
    BdxTransferProposal,
    CertNodeRef,
    CertStepContext,
    CheckRecord,
    LogFollower,
    OtaBdxTransfer,
} from "@matter/testing";
import { CertCheckFailedError, expectSequence, LOG_TIMEOUT, recordAll } from "./tc-support.js";

/**
 * Budget for the whole OTA exchange the precondition step drives: the announcement, the TH's own
 * `QueryImage`, and the BDX transfer of a 64 KiB image that follows.
 *
 * Shorter than the adapter's own default, because a BDX transfer is bounded by the peer's BDX-layer
 * response timeout — 30s on chip's OTA requestor — which MRP acks do not reset. A run that has not
 * finished inside this has not been delayed, it has stalled.
 */
const OTA_TRANSFER_TIMEOUT = Seconds(60);

/**
 * One BDX transfer the DUT served, with the TH log cursor that precedes it.
 *
 * The cursor is taken before the transfer is triggered and handed to every later step, because the
 * whole transfer happens inside the precondition: a step taking its own mark afterwards would search
 * a window the lines it wants are already behind.
 */
export interface BdxTransferEvidence {
    transfer: OtaBdxTransfer;
    from: number;
}

/**
 * Role wiring for a case whose DUT receives the image, named for the roles its plan gives them rather
 * than this suite's usual pair. The plan's DUT is a BDX receiver, which in Matter is an OTA
 * requestor, so here it is the device and the controller is the TH.
 */
export const BDX_RECEIVER_ROLES = {
    controllers: { th: "helper" },
    devices: { dut: "ota-requestor" },
} as const;

/** The transfer a precondition step recorded, or a step failure naming what is missing. */
export function transferOrFail(served: BdxTransferEvidence | undefined): BdxTransferEvidence {
    if (served === undefined) {
        throw new CertCheckFailedError("the precondition step served no BDX transfer for this step to read");
    }
    return served;
}

/**
 * Which role serves the image and which receives it.
 *
 * The same exchange carries two pairs of cases from opposite sides: TC-BDX-1.4 and TC-BDX-2.1 put
 * their DUT in the sender's role, which here is the controller, and TC-BDX-1.2 and TC-BDX-2.2 put it
 * in the receiver's, which is the device. Naming the roles rather than assuming them is what lets one
 * precondition serve both, and the evidence text follows the names so a bundle says which side the
 * claim is about.
 */
export interface OtaTransferRoles {
    /** Controller role that serves the image, as a BDX responder and sender. */
    sender: string;

    /** Device role that receives it, as a BDX initiator and receiver. */
    receiver: string;

    /**
     * Whether the receiver is expected to ask to apply what it downloaded.
     *
     * Absent, this follows the flavor: chip's `ota-requestor-app` ends the update at the download
     * unless started with `--autoApplyImage`. A case that passes that flag through `appArgs` says so
     * here, or the precondition stops waiting before the apply the case is about.
     */
    expectApply?: boolean;

    /** How long to wait for the receiver's `ApplyUpdateRequest`, for a case whose provider defers it. */
    applyTimeoutMs?: number;

    /**
     * How long the whole exchange may take, for a case whose provider defers the query.
     *
     * Absent, {@link OTA_TRANSFER_TIMEOUT}, which covers an announcement the receiver acts on at once.
     */
    timeoutMs?: number;
}

/**
 * Has `sender` serve one OTA image to `receiver` over BDX and waits until the receiver's own log has
 * caught up with the end of it.
 *
 * Every BDX case rests on a single transfer: their steps read different messages out of one exchange
 * rather than driving one each, which is what the plans describe ("DUT sends the first Block … DUT
 * sends further Blocks … DUT sends a BlockEOF") and what a real OTA does.
 *
 * The receiver opens the transfer with a `ReceiveInit` and the sender answers it. A transfer that
 * never happened rejects here rather than leaving the later steps to find nothing.
 */
export async function serveOtaTransfer(
    cx: CertStepContext,
    ref: CertNodeRef,
    { sender, receiver, expectApply: expectApplyOverride, applyTimeoutMs, timeoutMs }: OtaTransferRoles,
): Promise<BdxTransferEvidence> {
    const device = cx.devices[receiver];
    const from = await device.log.markSettled();
    const senderName = sender.toUpperCase();
    const receiverName = receiver.toUpperCase();

    // chip's ota-requestor-app treats the download as the end of the update unless it is started with
    // --autoApplyImage, and chip's own certification material starts it without that flag for the
    // download cases (Test_TC_SU_3_3; Test_TC_SU_3_4, which is about applying, passes it). So a chip
    // receiver is expected to ask only where the case started it with that flag and said so.
    const expectApply = expectApplyOverride ?? device.flavor === "matterjs";

    let transfer: OtaBdxTransfer;
    try {
        transfer = await cx.controllers[sender]
            .node(ref)
            .serveOtaUpdate({ timeoutMs: timeoutMs ?? OTA_TRANSFER_TIMEOUT, expectApply, applyTimeoutMs });
    } catch (e) {
        // Before the check, not after: the runner turns this into a skipped step only while the step has
        // recorded nothing, so recording first would fail the run on a controller that cannot serve at all.
        if (e instanceof UnsupportedByControllerError) {
            throw e;
        }
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }

    await recordAll(cx, [
        {
            what: `the ${senderName} served an OTA image over BDX`,
            check: () => ({
                type: "response",
                verdict: "pass",
                detail:
                    `${senderName} served software version ${transfer.softwareVersion} as ${transfer.fileSize} ` +
                    `bytes over BDX from endpoint ${transfer.providerEndpoint}, transferring ` +
                    `${transfer.transferredBytes} bytes`,
            }),
        },
        {
            // The sender's own account settles when it receives the last acknowledgement, which is
            // written on the receiver before that; waiting for the receiver to say so is what lets the
            // later steps read its log as a finished record rather than one still arriving.
            what: `the ${receiverName} acknowledged the end of the transfer`,
            check: () =>
                expectSequence(
                    device.log,
                    device.flavor,
                    `BDX BlockAckEOF the ${receiverName} sent`,
                    endOfTransferLines(),
                    from,
                    LOG_TIMEOUT,
                ),
        },
        {
            // Recorded, never failed: the apply is how the OTA exchange ends, and this precondition
            // waits for it so a case's teardown cannot strand the receiver mid-exchange. What the
            // cases themselves are about is the transfer, which is complete either way, and failing
            // here would take every later step's evidence with it.
            what: `the ${receiverName} finished the OTA exchange the transfer belongs to`,
            check: () => {
                if (transfer.applyAcknowledged) {
                    return {
                        type: "response",
                        verdict: "pass",
                        detail: `the ${receiverName} asked to apply the image and the ${senderName} allowed it`,
                    };
                }
                return {
                    type: "response",
                    verdict: "unverified",
                    accepted: expectApply
                        ? `the ${receiverName} had not asked to apply the image when the ${senderName} ` +
                          "stopped waiting; the transfer this case reads was complete before that"
                        : "chip's ota-requestor-app ends the update at the download unless started with " +
                          "--autoApplyImage, which chip's own Test_TC_SU_3_3 does not pass either, so no " +
                          "ApplyUpdateRequest follows the transfer this case reads",
                };
            },
        },
    ]);

    return { transfer, from };
}

/**
 * What a BDX message carried, as the TH's own log reports it.
 *
 * `length` is absent for a message that has none of its own — an acknowledgement.
 */
export interface BdxMessageRecord {
    counter: number;
    length?: number;
    line: string;
    index: number;
}

/**
 * How each flavor's TH states one kind of BDX message in its own log.
 *
 * matter.js names the message and its fields on one line; chip prints the message name on a line of
 * its own and then one indented line per field (`BdxMessages.cpp`'s `LogMessage`), so the two need
 * different readers rather than two spellings of one pattern.
 *
 * A flavor with no entry cannot state the claim at all. That is the case for every `Block` a chip
 * receiver takes in: `TransferSession::HandleBlock` records the block and returns, where
 * `HandleBlockEOF` beside it calls `LogMessage`. It is an absence in chip's own source, not a pattern
 * nobody has written.
 */
interface BdxMessageKind {
    /** One line carrying the counter as group 1 and, where the message has one, the length as group 2. */
    matterjs?: RegExp;

    /** The name chip's `LogMessage` prints, and whether the fields under it include a data length. */
    chip?: { name: string; hasLength: boolean };

    /**
     * How the message appears in chip's own message dump, which carries every BDX message rather than
     * only those `LogMessage` names.
     */
    chipDmg?: {
        /** BDX protocol opcode, which the dump's header line names (§ 11.22.5). */
        opcode: number;

        /** Whether the log's own node received the message rather than sent it. */
        inbound: boolean;

        /** Whether the message carries a data block, whose size follows from the payload's. */
        carriesData: boolean;
    };
}

// matter.js names a BDX message's own fields on the line the exchange writes for it rather than logging its own,
// and an inbound message is logged before BDX decodes it — so what a receiver took is read from the message it
// sends next: its query for the following block, or the ack that ends the transfer.
const BLOCK_RECEIVED: BdxMessageKind = {
    matterjs: /for: BDX\/BlockQuery .*\brcvdCnt: (\d+) rcvdLen: (\d+)/,
    chipDmg: { opcode: 0x11, inbound: true, carriesData: true },
};

const BLOCK_EOF_RECEIVED: BdxMessageKind = {
    matterjs: /for: BDX\/BlockAckEof cnt: (\d+) ackLen: (\d+)/,
    chip: { name: "BlockEOF", hasLength: true },
    chipDmg: { opcode: 0x12, inbound: true, carriesData: true },
};

const BLOCK_QUERY_SENT: BdxMessageKind = {
    matterjs: /for: BDX\/BlockQuery cnt: (\d+)/,
    chipDmg: { opcode: 0x10, inbound: false, carriesData: false },
};

const BLOCK_ACK_EOF_SENT: BdxMessageKind = {
    matterjs: /for: BDX\/BlockAckEof cnt: (\d+)/,
    chip: { name: "BlockAckEOF", hasLength: false },
    chipDmg: { opcode: 0x14, inbound: false, carriesData: false },
};

const CHIP_BLOCK_COUNTER = /\[ATM\]\s+Block Counter: (\d+)\s*$/;
const CHIP_DATA_LENGTH = /\[ATM\]\s+Data Length: (\d+)\s*$/;

/** Fields of one message in chip's own dump: the counter it carries, and the payload it arrived in. */
const CHIP_DMG_BLOCK_COUNTER = /\[DMG\]\s+BlockCounter = (\d+)\s*$/;
const CHIP_DMG_PAYLOAD_SIZE = /\[DMG\] Decrypted Payload \((\d+) bytes\)/;

/** Bytes of a BDX payload the block counter itself occupies, ahead of any data (§ 11.22.5.6). */
const CHIP_BDX_COUNTER_BYTES = 4;

/** Lines the dump writes between a message's header and its fields, before the next message begins. */
const CHIP_DMG_FIELD_WINDOW = 32;

/** The lines chip's `LogMessage` writes for one message kind, in the order it writes them. */
interface ChipMessageLines {
    name: RegExp;
    counter: RegExp;
    length?: RegExp;
}

/**
 * A wait for one chip message and a later read of it both come from here, because a wait that
 * settles on the name alone can return before the fields behind it have reached the follower, and
 * the read would then find no message at all.
 */
function chipLines(kind: BdxMessageKind): ChipMessageLines | undefined {
    if (kind.chip === undefined) {
        return undefined;
    }
    return {
        name: new RegExp(`\\[ATM\\] ${kind.chip.name}\\s*$`),
        counter: CHIP_BLOCK_COUNTER,
        length: kind.chip.hasLength ? CHIP_DATA_LENGTH : undefined,
    };
}

/** {@link chipLines} as the adjacent run {@link expectSequence} waits for. */
function chipSequence(lines: ChipMessageLines | undefined) {
    if (lines === undefined) {
        return undefined;
    }
    const { name, counter, length } = lines;
    return length === undefined ? [name, counter] : [name, counter, length];
}

/**
 * Every message of one kind the TH's log carries at or after `from`, in the order it logged them.
 *
 * This reads the buffer rather than waiting on it, which is only sound because the transfer is over:
 * {@link serveOtaTransfer} has already waited for the TH's own last line of it. Answers `undefined`
 * where the running flavor prints no such line at all.
 */
function messagesIn(
    log: LogFollower,
    flavor: string,
    kind: BdxMessageKind,
    from: number,
): BdxMessageRecord[] | undefined {
    const lines = log.lines.filter(line => !line.synthetic && line.index >= Math.max(0, from));

    if (flavor === "matterjs") {
        if (kind.matterjs === undefined) {
            return undefined;
        }
        const records = new Array<BdxMessageRecord>();
        for (const line of lines) {
            const match = kind.matterjs.exec(line.text);
            if (match !== null) {
                records.push({
                    counter: Number(match[1]),
                    length: match[2] === undefined ? undefined : Number(match[2]),
                    line: line.text,
                    index: line.index,
                });
            }
        }
        return records;
    }

    // chip's own message dump, not the `LogMessage` lines: the dump carries every BDX message, where
    // LogMessage names only some of them — `TransferSession::HandleBlock` records a received Block and
    // returns, and `PrepareBlockQuery` likewise, so a receiver's whole account lives here.
    const dmg = kind.chipDmg;
    if (!flavor.startsWith("chip") || dmg === undefined) {
        return undefined;
    }

    const header = new RegExp(
        `\\[DMG\\] ${dmg.inbound ? "<< from" : ">> to"} UDP.*\\[Bulk Data Exchange[^\\]]*\\(0x${dmg.opcode
            .toString(16)
            .padStart(2, "0")}\\)`,
    );

    const records = new Array<BdxMessageRecord>();
    for (let i = 0; i < lines.length; i++) {
        if (!header.test(lines[i].text)) {
            continue;
        }

        let counter: number | undefined;
        let payloadSize: number | undefined;
        for (let field = i + 1; field < Math.min(lines.length, i + CHIP_DMG_FIELD_WINDOW); field++) {
            if (header.test(lines[field].text)) {
                break;
            }
            payloadSize ??= numberFrom(CHIP_DMG_PAYLOAD_SIZE, lines[field].text);
            counter ??= numberFrom(CHIP_DMG_BLOCK_COUNTER, lines[field].text);
        }

        if (counter === undefined) {
            continue;
        }

        records.push({
            counter,
            length: dmg.carriesData && payloadSize !== undefined ? payloadSize - CHIP_BDX_COUNTER_BYTES : undefined,
            line: lines[i].text,
            index: lines[i].index,
        });
    }
    return records;
}

/** The first capture of `pattern` in `text` as a number, or `undefined` where it does not match. */
function numberFrom(pattern: RegExp, text: string) {
    const match = pattern.exec(text);
    return match === null ? undefined : Number(match[1]);
}

/**
 * A device-log check over messages a receiver's log carries, or the flavor's declared gap where it
 * logs none.
 */
export function overMessages(
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

/** {@link messagesIn} for the `Block` messages the TH took in. */
export function blocksReceived(log: LogFollower, flavor: string, from: number) {
    return messagesIn(log, flavor, BLOCK_RECEIVED, from);
}

/** {@link messagesIn} for the `BlockEOF` the TH took in. */
export function blockEofReceived(log: LogFollower, flavor: string, from: number) {
    return messagesIn(log, flavor, BLOCK_EOF_RECEIVED, from);
}

/** {@link messagesIn} for the `BlockQuery` messages the TH sent. */
export function blockQueriesSent(log: LogFollower, flavor: string, from: number) {
    return messagesIn(log, flavor, BLOCK_QUERY_SENT, from);
}

/**
 * What each flavor's TH writes for the last message of a transfer, derived from the same declaration
 * {@link blockAckEofSent} reads so the two cannot drift.
 *
 * Ordered, not adjacent: a line another module writes between these must not fail the precondition
 * every step of both cases rests on.
 */
function endOfTransferLines() {
    const chip = chipSequence(chipLines(BLOCK_ACK_EOF_SENT));
    return {
        matterjs: BLOCK_ACK_EOF_SENT.matterjs && [BLOCK_ACK_EOF_SENT.matterjs],
        chip: chip && { ordered: chip },
    };
}

/** {@link messagesIn} for the `BlockAckEOF` the TH sent. */
export function blockAckEofSent(log: LogFollower, flavor: string, from: number) {
    return messagesIn(log, flavor, BLOCK_ACK_EOF_SENT, from);
}

/**
 * A device-log check the running flavor cannot settle, carrying why.
 *
 * `accepted` keeps the step passing while the run's unverified count still carries the gap — the
 * declaration this directory's AGENTS.md reserves for a claim no pattern could match here, as opposed
 * to one nobody has written a pattern for yet.
 */
export function unloggedByFlavor(what: string, source: string): CheckRecord {
    return {
        type: "device-log",
        verdict: "unverified",
        accepted:
            `chip's BDX implementation writes no log line for ${what}: ${source} handles the message and returns, ` +
            "where the BlockEOF and BlockAckEOF paths beside it call LogMessage",
    };
}

/** chip renders a byte with `%X`, which pads to nothing: a zero byte prints as `0x0`. */
function chipByte(value: number) {
    return `0x${value.toString(16).toUpperCase()}`;
}

/** chip's own rendering of the transfer-control octet an accept carries, which names one mode. */
export function chipTransferControl(version: number, mode: "senderDrive" | "receiverDrive", asynchronous: boolean) {
    return chipByte(transferControlByte(version, mode === "senderDrive", mode === "receiverDrive", asynchronous));
}

/** chip's own rendering of the transfer-control octet a proposal carries, which may name both modes. */
export function chipProposedTransferControl(proposal: BdxTransferProposal) {
    const { version, senderDrive, receiverDrive, asynchronousTransfer } = proposal;
    return chipByte(transferControlByte(version, senderDrive, receiverDrive, asynchronousTransfer));
}

/** chip's own rendering of the range-control octet {@link rangeControlByte} builds. */
export function chipRangeControl(definiteLength: number | undefined, startOffset?: number) {
    return chipByte(rangeControlByte(definiteLength, startOffset));
}

/** chip's own rendering of a 64-bit value: `ChipLogFormatX64` is two zero-padded uppercase words. */
export function chipX64(value: number | undefined) {
    return `0x${(value ?? 0).toString(16).toUpperCase().padStart(16, "0")}`;
}

/** The transfer-control octet a BDX `*Init` or `*Accept` carries (§ 11.22.5.1). */
function transferControlByte(
    version: number,
    senderDrive: boolean,
    receiverDrive: boolean,
    asynchronous: boolean,
): number {
    return (version & 0xf) | (senderDrive ? 1 << 4 : 0) | (receiverDrive ? 1 << 5 : 0) | (asynchronous ? 1 << 6 : 0);
}

/**
 * Whether a message carries a Length field at all. Zero is the indefinite-length form, so it clears
 * the flag and writes no field, as `BdxReceiveAcceptSchema` and `BdxReceiveInitSchema` encode it.
 */
function hasDefiniteLength(definiteLength: number | undefined): definiteLength is number {
    return definiteLength !== undefined && definiteLength !== 0;
}

/** The range-control octet, whose flags a message derives from the fields it carries (§ 11.22.5.1). */
function rangeControlByte(definiteLength: number | undefined, startOffset: number | undefined): number {
    return (hasDefiniteLength(definiteLength) ? 1 : 0) | (startOffset === undefined ? 0 : 1 << 1);
}

function u8(value: number) {
    return value.toString(16).padStart(2, "0");
}

function u16le(value: number) {
    return u8(value & 0xff) + u8((value >> 8) & 0xff);
}

function u32le(value: number) {
    return u16le(value & 0xffff) + u16le(Math.floor(value / 0x10000) & 0xffff);
}

/**
 * The bytes a `ReceiveAccept` granting `accept` encodes to, as matter.js prints an inbound message's
 * payload.
 *
 * This is the wire form rather than a rendering of it, which is what makes a pattern built from it
 * evidence for the plan's "exactly one mode shall be chosen": a transfer control naming two modes,
 * or a version the responder was not entitled to, is a different byte.
 */
export function receiveAcceptPayload(accept: BdxTransferAccept) {
    const { version, mode, asynchronousTransfer, maxBlockSize, definiteLength } = accept;
    return (
        u8(transferControlByte(version, mode === "senderDrive", mode === "receiverDrive", asynchronousTransfer)) +
        u8(rangeControlByte(definiteLength, undefined)) +
        u16le(maxBlockSize) +
        (hasDefiniteLength(definiteLength) ? u32le(definiteLength) : "")
    );
}

/**
 * The bytes a `ReceiveInit` proposing `proposal` opens with, up to the file designator this does not
 * predict.
 */
export function receiveInitPayloadPrefix(proposal: BdxTransferProposal) {
    const { version, senderDrive, receiverDrive, asynchronousTransfer, maxBlockSize, startOffset, definiteLength } =
        proposal;
    return (
        u8(transferControlByte(version, senderDrive, receiverDrive, asynchronousTransfer)) +
        u8(rangeControlByte(definiteLength, startOffset)) +
        u16le(maxBlockSize) +
        (startOffset === undefined ? "" : u32le(startOffset)) +
        (hasDefiniteLength(definiteLength) ? u32le(definiteLength) : "")
    );
}
