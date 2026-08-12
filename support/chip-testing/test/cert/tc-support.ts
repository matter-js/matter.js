/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Time } from "@matter/main";
import type { CertNodeRef, CertStepContext, CheckRecord, LogExpectResult, LogFollower, LogLine } from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError } from "@matter/testing";

/**
 * Tracks commissioned node refs by role for one cert-test run and decommissions whatever's still
 * active on step failure. Each controller's own `decommission()` only removes *that controller's*
 * fabric via its own CASE session, so cleanup has to visit every role independently. Shared by
 * `TC-IDM-2.1.test.ts`/`TC-ACT-3.2.test.ts` (single "dut" role) and `TC-CADMIN-1.17.test.ts`
 * (multiple controller roles).
 */
export class CommissionedRefs<Role extends string = "dut"> {
    #refs = new Map<Role, CertNodeRef>();

    get(role: Role): CertNodeRef | undefined {
        return this.#refs.get(role);
    }

    set(role: Role, ref: CertNodeRef): void {
        this.#refs.set(role, ref);
    }

    clear(role: Role): void {
        this.#refs.delete(role);
    }

    /** Throws if `role` has no active ref — a step ran out of order relative to its commissioning step. */
    require(role: Role, what: string = role): CertNodeRef {
        const ref = this.#refs.get(role);
        if (ref === undefined) {
            throw new InternalError(`${what} has no active commissioned node ref`);
        }
        return ref;
    }

    async decommissionAll(cx: CertStepContext): Promise<void> {
        for (const [role, ref] of [...this.#refs]) {
            this.#refs.delete(role);
            try {
                await cx.controllers[role].node(ref).decommission();
            } catch (e) {
                console.warn(`Failed to decommission ${role} while cleaning up:`, e);
            }
        }
    }

    /**
     * Wraps a step so a thrown assertion still decommissions every active role before propagating —
     * the step engine (`cert-test.ts`'s `invoke`) aborts every later step without running it, so only
     * the step that actually threw gets a chance to clean up.
     */
    guarded(run: (cx: CertStepContext) => Promise<void>): (cx: CertStepContext) => Promise<void> {
        return async cx => {
            try {
                await run(cx);
            } catch (e) {
                await this.decommissionAll(cx);
                throw e;
            }
        };
    }

    /**
     * {@link guarded} for the common single-role case: also requires `role`'s ref up front and
     * threads it into `run`, matching the `(cx, ref)` shape most single-DUT steps want.
     */
    guardedWithRef(
        role: Role,
        run: (cx: CertStepContext, ref: CertNodeRef) => Promise<void>,
    ): (cx: CertStepContext) => Promise<void> {
        return this.guarded(async cx => {
            const ref = this.require(role, `Step ran before the ${role.toUpperCase()} was commissioned`);
            await run(cx, ref);
        });
    }
}

/**
 * Waits for `sequence` to match a run of CONSECUTIVE log lines anywhere at or after `from`.
 *
 * A candidate that matches `sequence[0]` but whose following lines don't stay adjacent is some
 * *other* block sharing the same opening (e.g. a ReportData `AttributePathIB` carrying an extra
 * `Attribute =` line where the request's wildcard block has none, possibly still in flight from an
 * earlier step — the follower pumps the device stream asynchronously, so a previous step's response
 * can surface after this step's `mark()`). Such a candidate is skipped and the search resumes at
 * the next one; genuine absence of the block surfaces as `log.expect`'s own timeout error. The
 * whole search shares one `timeoutMs` budget.
 */
export async function expectAdjacentLines(
    log: LogFollower,
    flavor: string,
    sequence: RegExp[],
    from: number,
    timeoutMs: number,
): Promise<{ verdict: "unverified" } | { verdict: "pass"; last: LogLine }> {
    const deadline = Time.nowMs + timeoutMs;
    const remaining = () => Math.max(1, deadline - Time.nowMs);

    let cursor = from;
    for (;;) {
        const anchor = await log.expect({ chip: sequence[0] }, { flavor, timeoutMs: remaining(), from: cursor });
        if (anchor.verdict === "unverified") {
            return { verdict: "unverified" };
        }

        let last = anchor.matched;
        let interleaved = false;
        for (const pattern of sequence.slice(1)) {
            const result = await log.expect(
                { chip: pattern },
                { flavor, timeoutMs: remaining(), from: last.index + 1 },
            );
            if (result.verdict === "unverified") {
                return { verdict: "unverified" };
            }
            if (result.matched.index !== last.index + 1) {
                interleaved = true;
                break;
            }
            last = result.matched;
        }

        if (!interleaved) {
            return { verdict: "pass", last };
        }
        cursor = anchor.matched.index + 1;
    }
}

// chip's DMG log dumps a ReportDataMessage every time the read handler sends one chunk, and an
// inbound StatusResponse every time it receives the DUT's per-chunk ack — verified against a real
// chip-all-clusters-app's log for a >1-MTU wildcard read (repeated ReportDataMessage/StatusResponse
// pairs). matter.js has no equivalent log line, so this is chip-only; see AGENTS.md's flavor-pattern
// policy for the matterjs "unverified" fallback.
const REPORT_DATA_SENT = /\[DMG\] ReportDataMessage =\s*$/;
const STATUS_RESPONSE_RECEIVED = /Msg RX from.*\(IM:StatusResponse\)/;

// How long a further report chunk may take to surface before the transfer counts as finished. The
// read has already returned by the time a step checks, so this covers the follower's pump lag only.
const CHUNK_QUIET_MS = 2_000;

/**
 * Confirms a chunked read actually chunked and that the DUT acked every chunk but the last: at least
 * two report chunks, with a `StatusResponse` received between every adjacent pair. Missing evidence
 * comes back as a `"fail"` record rather than a thrown timeout, so the step's own reporting carries
 * it. Returns `"unverified"` for the matterjs flavor (see AGENTS.md's flavor-pattern policy) rather
 * than a `"pass"` a log-scrape can't back up.
 */
export async function expectChunkedTransfer(
    log: LogFollower,
    flavor: string,
    from: number,
    timeoutMs: number,
): Promise<CheckRecord> {
    const deadline = Time.nowMs + timeoutMs;
    const remaining = () => Math.max(1, deadline - Time.nowMs);

    const chunks = new Array<LogLine>();
    for (;;) {
        // The second chunk is what proves the read chunked at all, so it gets the whole remaining
        // budget; every later one only has to outlast pump lag, and its absence ends the transfer.
        const timeout = chunks.length > 1 ? Math.min(CHUNK_QUIET_MS, remaining()) : remaining();
        let next: LogExpectResult;
        try {
            next = await log.expect(
                { chip: REPORT_DATA_SENT },
                { flavor, timeoutMs: timeout, from: chunks.length ? chunks[chunks.length - 1].index + 1 : from },
            );
        } catch (e) {
            // A source that ends mid-wait is as much an end of the transfer as a quiet period is;
            // whether the chunks seen so far are evidence enough is decided below, not here.
            if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
                break;
            }
            throw e;
        }
        if (next.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }
        chunks.push(next.matched);
    }

    if (chunks.length < 2) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern: String(REPORT_DATA_SENT),
            detail: `${chunks.length} report chunks — the read did not chunk`,
            logLine: chunks[0]?.index,
        };
    }

    const lines = log.lines;
    for (let i = 1; i < chunks.length; i++) {
        const acked = lines
            .slice(chunks[i - 1].index + 1, chunks[i].index)
            .some(line => !line.synthetic && STATUS_RESPONSE_RECEIVED.test(line.text));
        if (!acked) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern: String(STATUS_RESPONSE_RECEIVED),
                detail:
                    `No StatusResponse between the report chunks at log lines ${chunks[i - 1].index} and ` +
                    `${chunks[i].index} (chunk ${i} of ${chunks.length} went unacked)`,
                logLine: chunks[i].index,
            };
        }
    }

    return {
        type: "device-log",
        verdict: "pass",
        pattern: "ReportDataMessage, StatusResponse between every adjacent pair",
        detail: `${chunks.length} report chunks, each but the last followed by a StatusResponse`,
        matched: chunks[chunks.length - 1].text,
        logLine: chunks[chunks.length - 1].index,
    };
}

/**
 * A one-shot pairing code slot: {@link require} clears it on read so a commissioning attempt that
 * throws can't leave a stale code behind for a later run to pair against an expired window instead
 * of failing "the window-opening step must run first".
 */
export class PendingPairingCode {
    #code: string | undefined;

    set(code: string): void {
        this.#code = code;
    }

    require(): string {
        if (this.#code === undefined) {
            throw new InternalError("No pending manual pairing code; a commissioning-window step must run first");
        }
        const code = this.#code;
        this.#code = undefined;
        return code;
    }
}
