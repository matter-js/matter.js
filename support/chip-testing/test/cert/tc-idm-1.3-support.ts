/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CheckRecord, LogFollower } from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError } from "@matter/testing";
import { ChipFault } from "./fault-injection.js";
import {
    commandPathIBSequence,
    countMatches,
    expectAdjacentLines,
    expectSequence,
    INVOKE_REQUEST_MESSAGE,
} from "./tc-support.js";

/** A concrete command path of a batched invoke. */
export interface BatchPath {
    endpoint: number;
    cluster: number;
    command: number;
}

/**
 * `CommandHandlerImpl::TestOnlyInvokeCommandRequestWithFaultsInjected` announces every injected
 * response with this line, so a step proves the fault it armed actually fired rather than inferring it
 * from the response shape alone.
 */
export const FAULT_INJECTED_LINE = /\[DMG\] Response to InvokeRequestMessage overridden by fault injection\s*$/;

/**
 * The descriptions chip's own `GetFaultInjectionTypeStr` prints for the faults TC-IDM-1.3 arms, which
 * is how the log distinguishes which of the three fired. Quoted verbatim: chip logs the string
 * immediately after the colon, with no separating space.
 */
const FAULT_DESCRIPTIONS = new Map<number, string>([
    [
        ChipFault.imInvokeSeparateResponses,
        "Each response will be sent in a separate InvokeResponseMessage. The order of responses will be the same as " +
            "the original request.",
    ],
    [
        ChipFault.imInvokeSeparateResponsesInvertResponseOrder,
        "Each response will be sent in a separate InvokeResponseMessage. The order of responses will be reversed " +
            "from the original request.",
    ],
    [ChipFault.imInvokeSkipSecondResponse, "Single InvokeResponseMessages. Dropping response to second request"],
]);

function escapeForPattern(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, match => `\\${match}`);
}

function descriptionOf(fault: number) {
    const description = FAULT_DESCRIPTIONS.get(fault);
    if (description === undefined) {
        throw new Error(`No chip fault description known for fault id ${fault}`);
    }
    return description;
}

/**
 * The two consecutive lines chip logs when an armed invoke fault fires: the announcement and the
 * description of the response it substitutes.
 */
export function injectedFaultSequence(fault: number): RegExp[] {
    return [
        FAULT_INJECTED_LINE,
        new RegExp(`Injecting the following response:${escapeForPattern(descriptionOf(fault))}`),
    ];
}

/**
 * Records that `fault` fired for the invoke the TH received at or after `from`.
 */
export function expectInjectedFault(
    log: LogFollower,
    flavor: string,
    fault: number,
    from: number,
    timeoutMs: number,
): Promise<CheckRecord> {
    return expectSequence(log, flavor, `fault ${fault} injected`, injectedFaultSequence(fault), from, timeoutMs);
}

/**
 * Records that the TH answered the invoke at or after `from` itself, with no fault substituting the
 * response — the evidence for a step the plan expects to behave normally.
 *
 * Synchronous, unlike its positive counterpart: there is no line to wait for, and the invoke whose
 * absence of a fault this asserts has already been answered by the time a step can call this.
 */
export function expectNoInjectedFault(log: LogFollower, flavor: string, from: number): CheckRecord {
    if (!flavor.startsWith("chip")) {
        return { type: "device-log", verdict: "unverified" };
    }

    const count = countMatches(log, flavor, FAULT_INJECTED_LINE, from);
    return {
        type: "device-log",
        verdict: count === 0 ? "pass" : "fail",
        pattern: String(FAULT_INJECTED_LINE),
        detail: `${count} injected fault announcements after line ${from}, expected none`,
        logLine: from,
    };
}

/**
 * Records that the TH received exactly `expected` invoke requests at or after `from`.
 *
 * An armed fault fires on the *next* invoke the TH handles, whatever its source, and each fault's
 * `NumCallsToSkip` is calibrated for one invoke per step — so a stray invoke between two steps shifts
 * every later step onto the wrong fault. This check is what turns that into a legible failure instead
 * of an inexplicable one, and it is why the plan forbids any other command in this window.
 */
export function expectInvokeCount(log: LogFollower, flavor: string, from: number, expected: number): CheckRecord {
    if (!flavor.startsWith("chip")) {
        return { type: "device-log", verdict: "unverified" };
    }

    const count = countMatches(log, flavor, INVOKE_REQUEST_MESSAGE, from);
    return {
        type: "device-log",
        verdict: count === expected ? "pass" : "fail",
        pattern: String(INVOKE_REQUEST_MESSAGE),
        detail: `${count} invoke requests after line ${from}, expected ${expected}`,
        logLine: from,
    };
}

/**
 * Records that the batched invoke the TH received at or after `from` carried exactly `paths`, as
 * distinct `CommandPathIB` blocks in that order.
 *
 * Each block is searched from the end of the previous match, so a request whose paths arrived in
 * another order cannot satisfy this, and the caller's own uniqueness is what makes the ordering
 * meaningful — two identical paths would match the same block twice.
 */
export async function expectBatchRequestPaths(
    log: LogFollower,
    flavor: string,
    paths: BatchPath[],
    from: number,
    timeoutMs: number,
): Promise<CheckRecord> {
    const label = `InvokeRequestMessage with paths ${JSON.stringify(paths)}`;

    try {
        const envelope = await expectAdjacentLines(log, flavor, [INVOKE_REQUEST_MESSAGE], from, timeoutMs);
        if (envelope.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        let last = envelope.last;
        for (const { endpoint, cluster, command } of paths) {
            const block = await expectAdjacentLines(
                log,
                flavor,
                commandPathIBSequence(endpoint, cluster, command),
                last.index + 1,
                timeoutMs,
            );
            if (block.verdict === "unverified") {
                return { type: "device-log", verdict: "unverified" };
            }
            last = block.last;
        }

        return { type: "device-log", verdict: "pass", pattern: label, matched: last.text, logLine: last.index };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", pattern: label, detail: e.message, logLine: from };
        }
        throw e;
    }
}
