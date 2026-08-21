/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Millis, Seconds, Time } from "@matter/main";
import type { CheckRecord, LogFollower, LogLine } from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError } from "@matter/testing";
import { expectAdjacentLines } from "./tc-support.js";

// TC-IDM-5.1's own checks live beside the test case rather than inside it because a `TC-*.test.ts`
// registers a device-driven mocha test at import time, so the cert-framework spec set cannot import
// one to unit-test what it declares.

export const TIMED_REQUEST_MESSAGE = /\[DMG\] TimedRequestMessage =\s*$/;

/** `TimedRequestMessage::Parser::PrettyPrint` — one field, printed as bare lowercase hex. */
export function timedRequestSequence(timeout: Duration): RegExp[] {
    return [TIMED_REQUEST_MESSAGE, /\{\s*$/, new RegExp(`TimeoutMs = 0x${timeout.toString(16)},\\s*$`)];
}

const TIMED_REQUEST_FLAG = /timedRequest = true,\s*$/;

/**
 * chip's own receive line, which names both the exchange the message arrived on and the category of
 * the session it came over: `(S)` secure unicast, `(U)` unencrypted unicast, `(G)` secure groupcast
 * (`src/messaging/README.md`).
 */
const RECEIPT_LINE = /\[E:(\d+[ir])[^\]]*\] \((S|U|G)\) Msg RX from/;

// How far back from a message's decode dump its own receive line may sit. chip prints the two a
// handful of lines apart; the bound is what stops a search that finds nothing nearby from
// attributing a receipt logged minutes earlier to this message.
const RECEIPT_LOOKBACK_LINES = 1000;

/**
 * How many lines after a request message's opening brace its `timedRequest` flag may appear. chip
 * prints the message's fields in tag order, and only `suppressResponse` precedes `timedRequest`
 * (`InvokeRequestMessage.cpp`, `WriteRequestMessage.cpp`) — and it is optional on a write, which
 * matter.js omits and chip-tool sends. Anything further away belongs to another message.
 */
const FLAG_WITHIN_LINES = 2;

/**
 * How long the flag may lag its own message's opening brace. The two come from one decode dump, so
 * this covers the follower's pump lag only — bounding it is what turns a message that simply carries
 * no flag into that finding rather than into a generic timeout at the end of the step's whole budget.
 */
const FLAG_WAIT = Seconds(2);

/**
 * chip prefixes every line with its own timestamp, `[<seconds>.<fraction>]`, whose fraction is
 * milliseconds in the harness image's build and microseconds in the captures the certification YAML
 * carries. The digit count is what says which, so both are read rather than one assumed.
 */
export function timestampMsOf(text: string): number | undefined {
    const match = /^\[(\d+)\.(\d+)\]/.exec(text.trim());
    if (match === null) {
        return undefined;
    }
    const [, seconds, fraction] = match;
    return Number(seconds) * 1000 + Number(fraction) / 10 ** (fraction.length - 3);
}

/** The receive line one message arrived on. */
export interface Receipt {
    index: number;
    text: string;
    /** chip's own exchange id, role suffix included (e.g. `32870r`). */
    exchange: string;
    category: "S" | "U" | "G";
}

/** The receive line for the message whose decode dump starts at `index`, as {@link LogFollower.lastMatchBefore} finds it. */
function receiptBefore(log: LogFollower, index: number): Receipt | undefined {
    const found = log.lastMatchBefore(RECEIPT_LINE, index, RECEIPT_LOOKBACK_LINES);
    if (found === undefined) {
        return undefined;
    }
    const { line, match } = found;
    return { index: line.index, text: line.text, exchange: match[1], category: match[2] as Receipt["category"] };
}

/**
 * What looking for a `TimedRequestMessage` produced, as three outcomes rather than one optional line —
 * `SubscriptionIdLookup` keeps its own the same way, and for the same reason. Unlike that one,
 * `unnamed` here is reachable: this search asks for a chip pattern whatever the flavor, so a matterjs
 * TH produces it.
 */
export type TimedRequestLookup =
    /** The message was found; `receipt` is absent when no receive line precedes it, which is a failure. */
    | { outcome: "found"; line: LogLine; receipt?: Receipt; check: CheckRecord }
    /** This flavor's log names no timed request (see AGENTS.md's flavor-pattern policy). */
    | { outcome: "unnamed"; check: CheckRecord }
    /** The search itself failed; `check` carries why. */
    | { outcome: "failed"; check: CheckRecord };

/**
 * Confirms the device received a `TimedRequestMessage` asking for `timeout` at or after `from`, and
 * returns what a follow-up check needs to attribute the interaction that follows to this request.
 */
export async function expectTimedRequest(
    log: LogFollower,
    flavor: string,
    timeout: Duration,
    from: number,
    wait: Duration,
): Promise<TimedRequestLookup> {
    const pattern = `TimedRequestMessage(TimeoutMs = 0x${timeout.toString(16)})`;
    try {
        const result = await expectAdjacentLines(log, flavor, timedRequestSequence(timeout), from, wait);
        if (result.verdict === "unverified") {
            return { outcome: "unnamed", check: { type: "device-log", verdict: "unverified" } };
        }
        return {
            outcome: "found",
            line: result.last,
            receipt: receiptBefore(log, result.last.index),
            check: {
                type: "device-log",
                verdict: "pass",
                pattern,
                matched: result.last.text,
                logLine: result.last.index,
            },
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return {
                outcome: "failed",
                check: { type: "device-log", verdict: "fail", pattern, detail: e.message, logLine: from },
            };
        }
        throw e;
    }
}

/** Confirms the session the timed request arrived on was unicast. */
export function expectUnicastReceipt(timed: TimedRequestLookup): CheckRecord {
    // A failed search keeps its own reason rather than arriving here as an unverified. Callers gate
    // on `check` first, so this is the second line of defence.
    if (timed.outcome !== "found") {
        return timed.check;
    }

    const { receipt } = timed;
    if (receipt === undefined) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern: String(RECEIPT_LINE),
            detail: `No receive line precedes the timed request at log line ${timed.line.index}`,
            logLine: timed.line.index,
        };
    }

    return {
        type: "device-log",
        verdict: receipt.category === "G" ? "fail" : "pass",
        pattern: String(RECEIPT_LINE),
        detail:
            receipt.category === "G"
                ? "The timed request arrived over a group session"
                : `unicast session, exchange ${receipt.exchange}`,
        matched: receipt.text,
        logLine: receipt.index,
    };
}

/**
 * Confirms the interaction the timed request opened followed it on the same exchange, inside the
 * window it asked for, carrying `timedRequest = true`.
 *
 * The follow-up is attributed by exchange id, not by "the next message after the timed request": a
 * second administrator's own timed interaction with this device, or a retry of this one, otherwise
 * stands in for it — passing on someone else's evidence, or failing on a span measured between two
 * different interactions.
 *
 * The flag is matched by proximity to the message's own opening brace rather than adjacency (see
 * {@link FLAG_WITHIN_LINES}). Elapsed time comes from the two messages' own log timestamps, which is
 * what the plan asks for: the device is the party that has to see the follow-up inside the window.
 */
export async function expectTimedFollowUp(
    log: LogFollower,
    flavor: string,
    message: RegExp,
    timed: TimedRequestLookup,
    budget: Duration,
    wait: Duration,
): Promise<CheckRecord> {
    if (timed.outcome !== "found") {
        return timed.check;
    }
    const { line: timedLine, receipt } = timed;

    const pattern = `${message.source} with ${TIMED_REQUEST_FLAG.source} within ${budget}ms`;
    if (receipt === undefined) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern,
            detail: `The timed request at log line ${timedLine.index} has no receive line to take an exchange from`,
            logLine: timedLine.index,
        };
    }

    const deadline = Time.nowMs + wait;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowMs));
    let cursor = timedLine.index + 1;

    try {
        for (;;) {
            const block = await expectAdjacentLines(log, flavor, [message, /\{\s*$/], cursor, remaining());
            if (block.verdict === "unverified") {
                return { type: "device-log", verdict: "unverified" };
            }
            cursor = block.last.index + 1;

            if (receiptBefore(log, block.last.index)?.exchange !== receipt.exchange) {
                continue;
            }

            // The matched block is [message, "{"], so the line before its last is the message's own
            const messageLine = log.at(block.last.index - 1);
            if (messageLine === undefined) {
                throw new InternalError(`Matched a message block at line ${block.last.index} with no line before it`);
            }
            const flagged =
                log
                    .window(block.last.index + 1, FLAG_WITHIN_LINES)
                    .some(({ synthetic, text }) => !synthetic && TIMED_REQUEST_FLAG.test(text)) ||
                (await waitForLaggingFlag(log, flavor, block.last.index, remaining()));
            if (flagged === "unverified") {
                return { type: "device-log", verdict: "unverified" };
            }
            if (!flagged) {
                return {
                    type: "device-log",
                    verdict: "fail",
                    pattern,
                    detail: `The message at log line ${messageLine.index} carries no timedRequest flag`,
                    matched: messageLine.text,
                    logLine: messageLine.index,
                };
            }

            const started = timestampMsOf(timedLine.text);
            const arrived = timestampMsOf(messageLine.text);
            if (started === undefined || arrived === undefined) {
                return {
                    type: "device-log",
                    verdict: "fail",
                    pattern,
                    detail: "A message line carries no readable timestamp, so the elapsed time cannot be measured",
                    logLine: messageLine.index,
                };
            }

            // A clock that moved backwards between the two lines is no evidence of promptness
            const elapsed = arrived - started;
            return {
                type: "device-log",
                verdict: elapsed >= 0 && elapsed <= budget ? "pass" : "fail",
                pattern,
                detail: `arrived ${elapsed.toFixed(1)}ms after the timed request (budget ${budget}ms)`,
                matched: messageLine.text,
                logLine: messageLine.index,
            };
        }
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", pattern, detail: e.message, logLine: timedLine.index };
        }
        throw e;
    }
}

/**
 * Whether the flag arrives within {@link FLAG_WAIT} of a message whose own buffered lines did not
 * carry it yet, and close enough to still be that message's own.
 */
async function waitForLaggingFlag(
    log: LogFollower,
    flavor: string,
    braceIndex: number,
    remaining: Duration,
): Promise<boolean | "unverified"> {
    try {
        const flag = await log.expect(
            { chip: TIMED_REQUEST_FLAG },
            { flavor, timeoutMs: Duration.min(FLAG_WAIT, remaining), from: braceIndex + 1 },
        );
        if (flag.verdict === "unverified") {
            return "unverified";
        }
        return flag.matched.index <= braceIndex + FLAG_WITHIN_LINES;
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return false;
        }
        throw e;
    }
}
