/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Millis, Time } from "@matter/main";
import type {
    AttributePathSpec,
    CertNodeRef,
    CertStepContext,
    CheckRecord,
    LogFlavor,
    LogFollower,
    LogLine,
} from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError, CertStepNotApplicableError, flavorFamily } from "@matter/testing";
import {
    chipHeaderBefore,
    chunkingNotApplicableOverTcp,
    chunkingOverTcpReason,
    escapeRegExp,
    expectAttributePathIB,
    LOG_TIMEOUT,
} from "./tc-support.js";

const WRITE_REQUEST_RECEIVED =
    /\[DMG\] << from (UDP|TCP):.* \| (\d+) \| \[.*\/ Write Request \(0x06\) \/ Session = \d+ \/ Exchange = (\d+)\]\s*$/;
const WRITE_RESPONSE_SENT =
    /\[DMG\] >> to UDP:.* \| (\d+) \| \[.*\/ Write Response \(0x07\) \/ Session = \d+ \/ Exchange = (\d+)\]\s*$/;
const WRITE_REQUEST_DUMP = /\[DMG\] WriteRequestMessage =\s*$/;

// `WriteRequestMessage::Parser::PrettyPrint` closes the message at depth 0, where every nested block is indented
const WRITE_REQUEST_DUMP_END = /\[DMG\] \},\s*$/;
const MORE_CHUNKS = /\[DMG\]\s+moreChunkedMessages = true,\s*$/;

/**
 * A matter.js TH handling one chunk of a write: its session (`(tcp)` after the session id over TCP), exchange, and
 * whether more chunks follow.
 */
const MATTERJS_WRITE_HANDLED = /InteractionServer Write « (@[^⇵\s]+?)(\(tcp\))?⇵([0-9a-f]+)( moreChunkedMessages)?/;

/** The matter.js TH's lines on one write exchange of one session. */
function matterjsWriteExchange(session: string, exchange: string) {
    const id = `${escapeRegExp(session)}⇵${exchange}✉`;
    return {
        /** The TH's answer to a chunk, with the answer's message counter. */
        responseSent: new RegExp(
            `MessageChannel Message » for: (?:WriteResponse-chunk|I/WriteResponse) .*id: ${id}([0-9a-f]+) `,
        ),

        /** The TH's receipt of a chunk from the DUT. */
        requestReceived: new RegExp(`MessageExchange Message « for: (?:I/)?WriteRequest id: ${id}[0-9a-f]+ `),

        /** The TH's receipt of a message acknowledging the TH's message `counter`. */
        ackOf: (counter: string) =>
            new RegExp(`MessageExchange Message « for: \\S+ id: ${id}[0-9a-f]+ .*acked: ${counter}(?![0-9a-f])`),
    };
}

/** The TH's receipt of a message on `exchange` that acknowledges the TH's message `counter`. */
function ackOf(exchange: string, counter: string) {
    return new RegExp(`\\[EM\\] >>> \\[E:${exchange}r S:\\d+ M:\\d+ \\(Ack:${counter}\\)\\]`);
}

/** The message counter and exchange of a Write Request trace line. */
function requestOf(trace: LogLine) {
    const [, transport, counter, exchange] = WRITE_REQUEST_RECEIVED.exec(trace.text) ?? [];
    if (transport === undefined || counter === undefined || exchange === undefined) {
        throw new InternalError(`Not a Write Request trace line: ${trace.text}`);
    }
    return { transport, counter, exchange };
}

/**
 * Whether a chunked write to `path` applies: the plan expects a write just over one MTU to be chunked, which a TCP
 * session does not do. The write changes the TH, so the transport comes from a read of `path` before it. Where the TH's
 * log does not show that read, the step runs and {@link expectChunkedWrite} judges the write's own transport.
 */
export async function chunkedWriteNotApplicable(
    cx: CertStepContext,
    ref: CertNodeRef,
    path: AttributePathSpec,
): Promise<string | undefined> {
    const th = cx.devices.th;
    const from = th.log.mark();
    await cx.controllers.dut.node(ref).readAttribute(path);
    const request = await expectAttributePathIB(th.log, th.flavor, path, from, LOG_TIMEOUT);
    return chunkingNotApplicableOverTcp(th.log, th.flavor, request);
}

interface WriteChunk {
    trace: LogLine;
    dump: LogLine;
    end: LogLine;
    more: boolean;
}

// How far back from the step's path match to look for its request's trace line; a runaway-loop guard, as in
// tc-support.ts
const TRACE_LOOKBACK_LINES = 1000;

/**
 * Confirms on the TH's log that the write whose path the check `request` matched was sent over UDP and chunked as
 * Matter Core § 10.2.3 requires: at least two `WriteRequestMessage`s on one exchange, every one but the last with `MoreChunkedMessages`
 * set, and each next chunk sent only after the DUT had the TH's `WriteResponse` to the previous one.
 *
 * The TH processes messages in arrival order, so the order of its own lines cannot show that the DUT waited: a chunk
 * sent early is still answered in turn. What shows it is the acknowledgement. The DUT acknowledges the `WriteResponse`
 * with the message that carries the next chunk, or with a standalone acknowledgement before it; either way the TH logs
 * that acknowledgement no later than its receipt of the next chunk. A DUT that sent the next chunk without waiting
 * acknowledges the response only later.
 *
 * A write over TCP throws {@link CertStepNotApplicableError}: the plan's chunking does not apply there, and the step
 * finds that before it writes. Thrown after the write, it fails the run with that reason.
 */
export async function expectChunkedWrite(
    log: LogFollower,
    flavor: LogFlavor,
    request: CheckRecord,
    timeout: Duration,
): Promise<CheckRecord> {
    const deadline = Time.nowUs + timeout;
    const waitFor = async (pattern: RegExp, at: number) => {
        try {
            return await log.expectPattern(pattern, {
                timeoutMs: Millis(Math.max(1, deadline - Time.nowUs)),
                from: at,
            });
        } catch (e) {
            if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
                return undefined;
            }
            throw e;
        }
    };
    const fail = (detail: string, logLine: number, pattern: RegExp): CheckRecord => ({
        type: "device-log",
        verdict: "fail",
        pattern: String(pattern),
        detail,
        logLine,
    });

    if (request.verdict === "unverified") {
        return { type: "device-log", verdict: "unverified", detail: "The write request itself was not verifiable" };
    }
    if (request.verdict !== "pass" || request.logLine === undefined) {
        return {
            type: "device-log",
            verdict: "fail",
            detail: `The write request was not found, so its chunks cannot be told from another write's: ${request.detail ?? ""}`,
        };
    }

    switch (flavorFamily(flavor)) {
        case "chip":
            return expectChipChunkedWrite(log, request.logLine, waitFor, fail);
        case "matterjs":
            return expectMatterjsChunkedWrite(log, request.logLine, waitFor, fail);
        default:
            return {
                type: "device-log",
                verdict: "unverified",
                detail: `No chunked-write pattern for a ${flavor} TH's log`,
            };
    }
}

type WaitFor = (pattern: RegExp, at: number) => Promise<LogLine | undefined>;
type Fail = (detail: string, logLine: number, pattern: RegExp) => CheckRecord;

async function expectChipChunkedWrite(
    log: LogFollower,
    requestLine: number,
    waitFor: WaitFor,
    fail: Fail,
): Promise<CheckRecord> {
    const first = chipHeaderBefore(log, WRITE_REQUEST_RECEIVED, requestLine, TRACE_LOOKBACK_LINES)?.line;
    if (first === undefined) {
        return fail(
            `No Write Request trace line of its own before the request's path at log line ${requestLine}`,
            requestLine,
            WRITE_REQUEST_RECEIVED,
        );
    }
    const { transport, exchange, counter } = requestOf(first);
    if (transport === "TCP") {
        throw new CertStepNotApplicableError(chunkingOverTcpReason("write request", first.index));
    }
    const received = new Set([counter]);

    const chunkAt = async (trace: LogLine): Promise<WriteChunk | undefined> => {
        const dump = await waitFor(WRITE_REQUEST_DUMP, trace.index + 1);
        const end = dump && (await waitFor(WRITE_REQUEST_DUMP_END, dump.index + 1));
        if (dump === undefined || end === undefined) {
            return undefined;
        }
        const more = log.window(dump.index + 1, end.index - dump.index).some(line => MORE_CHUNKS.test(line.text));
        return { trace, dump, end, more };
    };

    const chunks = new Array<WriteChunk>();
    let trace = first;
    for (;;) {
        const chunk = await chunkAt(trace);
        if (chunk === undefined) {
            return fail(
                `No complete WriteRequestMessage decode for the Write Request at log line ${trace.index}`,
                trace.index,
                WRITE_REQUEST_DUMP,
            );
        }
        chunks.push(chunk);
        if (!chunk.more) {
            break;
        }

        // The TH logs a retransmitted request before it drops it as a duplicate, without a decode of its own
        const isNextChunk = (line: LogLine) => {
            const request = requestOf(line);
            return request.exchange === exchange && !received.has(request.counter);
        };
        let next: LogLine | undefined = await waitFor(WRITE_REQUEST_RECEIVED, chunk.end.index + 1);
        while (next !== undefined && !isNextChunk(next)) {
            next = await waitFor(WRITE_REQUEST_RECEIVED, next.index + 1);
        }
        if (next === undefined) {
            return fail(
                `Write chunk ${chunks.length} on Exchange ${exchange} announced a further chunk, and none followed`,
                chunk.end.index,
                WRITE_REQUEST_RECEIVED,
            );
        }
        received.add(requestOf(next).counter);
        trace = next;
    }

    if (chunks.length < 2) {
        return fail(
            `The write on Exchange ${exchange} arrived as one WriteRequestMessage without MoreChunkedMessages — it did ` +
                "not chunk",
            first.index,
            MORE_CHUNKS,
        );
    }

    for (let i = 1; i < chunks.length; i++) {
        const previous = chunks[i - 1];
        const current = chunks[i];
        const between = log.window(previous.end.index + 1, current.trace.index - previous.end.index - 1);
        const response = between
            .map(line => WRITE_RESPONSE_SENT.exec(line.text))
            .find(match => match?.[2] === exchange);
        if (!response) {
            return fail(
                `The TH sent no WriteResponse on Exchange ${exchange} between write chunks ${i} and ${i + 1}`,
                current.trace.index,
                WRITE_RESPONSE_SENT,
            );
        }

        const ack = ackOf(exchange, response[1]);
        const acked = log
            .window(previous.end.index + 1, current.dump.index - previous.end.index - 1)
            .some(line => ack.test(line.text));
        if (!acked) {
            return fail(
                `The DUT sent write chunk ${i + 1} on Exchange ${exchange} without having acknowledged the TH's ` +
                    `WriteResponse ${response[1]} to chunk ${i}`,
                current.trace.index,
                ack,
            );
        }
    }

    const last = chunks[chunks.length - 1];
    return {
        type: "device-log",
        verdict: "pass",
        pattern: `${WRITE_REQUEST_RECEIVED}, ${MORE_CHUNKS} on every chunk but the last, each next chunk after the ack of the WriteResponse`,
        detail:
            `${chunks.length} WriteRequestMessage chunks on Exchange ${exchange}, each but the last with ` +
            "MoreChunkedMessages, each next one sent after the DUT acknowledged the TH's WriteResponse to the previous",
        matched: last.trace.text,
        logLine: last.trace.index,
    };
}

/**
 * The matter.js counterpart of {@link expectChipChunkedWrite}. `requestLine` is the TH's `InteractionServer Write «`
 * line for the first chunk, which names the session and exchange. Each further chunk on that exchange has a line of
 * its own, and every one but the last carries `moreChunkedMessages`.
 *
 * The TH logs a chunk's `Write «` line only after the DUT acknowledged the TH's answer to the previous chunk, so the
 * proof is the TH's receipt of the next chunk: it must come after the TH's `WriteResponse` and carry, or follow, the
 * DUT's acknowledgement of it. A DUT that sent the next chunk without waiting has that receipt logged first.
 */
async function expectMatterjsChunkedWrite(
    log: LogFollower,
    requestLine: number,
    waitFor: WaitFor,
    fail: Fail,
): Promise<CheckRecord> {
    const first = log.at(requestLine);
    const handled = first === undefined ? null : MATTERJS_WRITE_HANDLED.exec(first.text);
    if (first === undefined || handled === null) {
        return fail(`Log line ${requestLine} is not a write the TH handled`, requestLine, MATTERJS_WRITE_HANDLED);
    }
    const [, session, tcp, exchange] = handled;
    if (tcp !== undefined) {
        throw new CertStepNotApplicableError(chunkingOverTcpReason("write request", first.index));
    }
    const lines = matterjsWriteExchange(session, exchange);
    const onThisExchange = (line: LogLine) => {
        const match = MATTERJS_WRITE_HANDLED.exec(line.text);
        return match?.[1] === session && match[3] === exchange;
    };

    const chunks = [first];
    for (let chunk = first; MATTERJS_WRITE_HANDLED.exec(chunk.text)?.[4] !== undefined;) {
        let next = await waitFor(MATTERJS_WRITE_HANDLED, chunk.index + 1);
        while (next !== undefined && !onThisExchange(next)) {
            next = await waitFor(MATTERJS_WRITE_HANDLED, next.index + 1);
        }
        if (next === undefined) {
            return fail(
                `Write chunk ${chunks.length} on Exchange ${exchange} announced a further chunk, and none followed`,
                chunk.index,
                MATTERJS_WRITE_HANDLED,
            );
        }
        chunks.push(next);
        chunk = next;
    }

    if (chunks.length < 2) {
        return fail(
            `The write on Exchange ${exchange} arrived as one WriteRequestMessage without MoreChunkedMessages — it did ` +
                "not chunk",
            first.index,
            MATTERJS_WRITE_HANDLED,
        );
    }

    for (let i = 1; i < chunks.length; i++) {
        const previous = chunks[i - 1];
        const current = chunks[i];
        const between = log.window(previous.index + 1, current.index - previous.index - 1);
        const responseAt = between.findIndex(line => lines.responseSent.test(line.text));
        if (responseAt === -1) {
            return fail(
                `The TH sent no WriteResponse on Exchange ${exchange} between write chunks ${i} and ${i + 1}`,
                current.index,
                lines.responseSent,
            );
        }
        const counter = lines.responseSent.exec(between[responseAt].text)?.[1] ?? "";

        const receivedAt = between.findIndex(line => lines.requestReceived.test(line.text));
        if (receivedAt === -1) {
            return fail(
                `The TH logged no receipt of write chunk ${i + 1} on Exchange ${exchange} before handling it`,
                current.index,
                lines.requestReceived,
            );
        }

        const ack = lines.ackOf(counter);
        if (!between.slice(responseAt + 1, receivedAt + 1).some(line => ack.test(line.text))) {
            return fail(
                `The DUT sent write chunk ${i + 1} on Exchange ${exchange} (log line ${between[receivedAt].index}) ` +
                    `without having acknowledged the TH's WriteResponse ${counter} to chunk ${i}`,
                between[receivedAt].index,
                ack,
            );
        }
    }

    const last = chunks[chunks.length - 1];
    return {
        type: "device-log",
        verdict: "pass",
        pattern: `${MATTERJS_WRITE_HANDLED}, moreChunkedMessages on every chunk but the last, each next chunk after the ack of the WriteResponse`,
        detail:
            `${chunks.length} WriteRequestMessage chunks on Exchange ${exchange}, each but the last with ` +
            "MoreChunkedMessages, each next one sent after the DUT acknowledged the TH's WriteResponse to the previous",
        matched: last.text,
        logLine: last.index,
    };
}
