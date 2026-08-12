/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Time } from "@matter/main";
import type {
    AttributePathSpec,
    CertNodeRef,
    CertStepContext,
    CheckRecord,
    LogExpectResult,
    LogFollower,
    LogLine,
} from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError } from "@matter/testing";

/**
 * Tracks commissioned node refs by role for one cert-test run and decommissions whatever's still
 * active on step failure. Each controller's own `decommission()` only removes *that controller's*
 * fabric via its own CASE session, so cleanup has to visit every role independently. Shared by
 * `TC-IDM-2.1.test.ts`/`TC-ACT-3.2.test.ts`/`TC-IDM-1.1.test.ts` (single "dut" role) and
 * `TC-CADMIN-1.17.test.ts` (multiple controller roles).
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

// chip's raw stdout, as LogFollower captures it, names the top-level request message in the
// `[DMG] <MessageName> =` shape below — the same shape as REPORT_DATA_SENT above. The connectedhomeip
// YAML docs print these captures as `CHIP:DMG: <MessageName> =` instead; that's the docs' own
// rendering, not the text LogFollower ever sees.
export const WRITE_REQUEST_MESSAGE = /\[DMG\] WriteRequestMessage =\s*$/;
export const INVOKE_REQUEST_MESSAGE = /\[DMG\] InvokeRequestMessage =\s*$/;
export const SUBSCRIBE_REQUEST_MESSAGE = /\[DMG\] SubscribeRequestMessage =\s*$/;

// chip's StatusResponseMessage decode dump carries the numeric status on its own nested line, not
// on the same line as the message name — verified against Test_TC_IDM_4_1.yaml's captured
// subscribe-establishment blocks (`Status = 0x00 (SUCCESS),`). This is the generic StatusIB shape,
// so it also matches a write/invoke response's own success status, not only StatusResponseMessage's;
// a caller relying on it for "N StatusResponseMessage successes" needs the cursor window to exclude
// unrelated status lines itself.
export const STATUS_RESPONSE_SUCCESS = /Status = 0x00 \(SUCCESS\),?\s*$/;

/**
 * The literal, consecutive `CHIP:DMG` lines chip emits for one `AttributePathIB`: an opening
 * `AttributePathIB =` / `{`, one line per present field in Endpoint/Cluster/Attribute order, and a
 * closing `}`. A wildcard (absent) field has no line at all, which is why {@link expectAttributePathIB}
 * walks this whole sequence rather than testing a single "does X appear" pattern — that's what proves
 * the shape matches exactly, not just that the concrete fields happen to appear somewhere.
 */
export function attributePathIBSequence(fields: AttributePathSpec): RegExp[] {
    const sequence = [/AttributePathIB =\s*$/, /\{\s*$/];
    if (fields.endpoint !== undefined) {
        sequence.push(new RegExp(`Endpoint = 0x${fields.endpoint.toString(16)},\\s*$`));
    }
    if (fields.cluster !== undefined) {
        sequence.push(new RegExp(`Cluster = 0x${fields.cluster.toString(16)},\\s*$`));
    }
    if (fields.attribute !== undefined) {
        sequence.push(new RegExp(`Attribute = 0x${attributeHex(fields.attribute)},\\s*$`));
    }
    sequence.push(/\}\s*$/);
    return sequence;
}

// chip prints Endpoint/Cluster as bare lowercase hex (no padding, e.g. 0x1d) but Attribute as an
// 8-digit, underscore-grouped, uppercase MEI (e.g. 0x0000_FFFD) — verified against a real
// chip-all-clusters-app's `--trace_decode 1` output; see AGENTS.md's "wildcard path idioms" section.
function attributeHex(id: number): string {
    const hex = id.toString(16).toUpperCase().padStart(8, "0");
    return `${hex.slice(0, 4)}_${hex.slice(4)}`;
}

/**
 * Confirms chip's log carries exactly the `AttributePathIB` shape `fields` describes as a
 * consecutive block at or after `from` (see {@link expectAdjacentLines} — a wildcard sequence is a
 * strict prefix of a concrete one, so a block with extra field lines is a different block, not a
 * match). Returns `"unverified"` for the matterjs flavor (see AGENTS.md's flavor-pattern policy):
 * matter.js doesn't emit this chip-specific log shape.
 */
export async function expectAttributePathIB(
    log: LogFollower,
    flavor: string,
    fields: AttributePathSpec,
    from: number,
    timeoutMs: number,
): Promise<CheckRecord> {
    const result = await expectAdjacentLines(log, flavor, attributePathIBSequence(fields), from, timeoutMs);
    if (result.verdict === "unverified") {
        return { type: "device-log", verdict: "unverified" };
    }

    return {
        type: "device-log",
        verdict: "pass",
        pattern: `AttributePathIB ${JSON.stringify(fields)}`,
        matched: result.last.text,
        logLine: result.last.index,
    };
}

/**
 * Confirms `message` (e.g. {@link WRITE_REQUEST_MESSAGE} or {@link SUBSCRIBE_REQUEST_MESSAGE} — a
 * request kind whose payload carries an `AttributePathIB`, not {@link INVOKE_REQUEST_MESSAGE}, whose
 * `CommandDataIB` needs a different matcher) appears at or after `from`, then that the
 * `AttributePathIB` block for `fields` follows it at or after that point (see
 * {@link expectAttributePathIB}). Anchoring on the request-message name first, not just the path
 * block on its own, rules out a differently-typed request landing at the same log position. Both
 * waits share `timeoutMs`'s deadline; a timeout or closed source from either stage is recorded as a
 * `"fail"` rather than propagating uncaught.
 */
export async function expectMessageWithPath(
    log: LogFollower,
    flavor: string,
    message: RegExp,
    fields: AttributePathSpec,
    from: number,
    timeoutMs: number,
): Promise<CheckRecord> {
    const deadline = Time.nowMs + timeoutMs;
    const remaining = () => Math.max(1, deadline - Time.nowMs);

    let anchor: LogExpectResult;
    try {
        anchor = await log.expect({ chip: message }, { flavor, timeoutMs: remaining(), from });
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", pattern: String(message), detail: e.message, logLine: from };
        }
        throw e;
    }
    if (anchor.verdict === "unverified") {
        return { type: "device-log", verdict: "unverified" };
    }

    try {
        return await expectAttributePathIB(log, flavor, fields, anchor.matched.index + 1, remaining());
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern: `AttributePathIB ${JSON.stringify(fields)}`,
                detail: e.message,
                logLine: anchor.matched.index,
            };
        }
        throw e;
    }
}

/** Throws if `id` is `undefined` — narrows a model element's optional numeric id for `.toString(16)`. */
export function requireId(id: number | undefined, what: string): number {
    if (id === undefined) {
        throw new InternalError(`${what} has no numeric id`);
    }
    return id;
}

/** One `CommandFields` entry: a field id and its value, matched as `0x<id> = <value> (unsigned),`. */
export interface CommandFieldValue {
    id: number;
    value: number;
}

/**
 * The literal, consecutive `CHIP:DMG` lines chip emits for one invoked command's `CommandDataIB`:
 * the request-side wrapper, then `CommandPathIB`'s Endpoint/Cluster/Command, each on its own line, in
 * that fixed order — mirrors {@link attributePathIBSequence} for the read-side equivalent.
 * Endpoint/Cluster/Command are all bare lowercase hex (verified against a real chip-bridge-app
 * capture), unlike `AttributePathIB`'s Attribute field, which needs an 8-digit padded MEI.
 *
 * The leading `CommandDataIB =` line is load-bearing, not decorative: a status-only response's own
 * `CommandPathIB` echo nests under `CommandStatusIB =` instead — anchoring here is what stops this
 * from matching a trailing response echo instead of a fresh request. See AGENTS.md's "async log
 * delivery lag" section.
 */
export function commandPathIBSequence(endpoint: number, cluster: number, command: number): RegExp[] {
    return [
        /CommandDataIB =\s*$/,
        /\{\s*$/,
        /CommandPathIB =\s*$/,
        /\{\s*$/,
        new RegExp(`EndpointId = 0x${endpoint.toString(16)},\\s*$`),
        new RegExp(`ClusterId = 0x${cluster.toString(16)},\\s*$`),
        new RegExp(`CommandId = 0x${command.toString(16)},\\s*$`),
    ];
}

/**
 * Confirms chip's `InvokeRequestMessage` log carries a `CommandPathIB` matching `endpoint`/`cluster`/
 * `command` as a consecutive block at or after `from` (see {@link expectAdjacentLines}), then that
 * every `fields` entry appears afterward, in order, as its own `0x<id> = <value>,` line inside
 * `CommandFields`. Field lines aren't required adjacent to the `CommandPathIB` block itself — chip
 * emits a blank `CHIP:DMG:` separator line in between that isn't part of what this check verifies. A
 * search always starts at or after the previous match's own index (`log.expect`'s `from`), so this
 * can't match a field line belonging to an earlier invoke. Returns `"unverified"` for the matterjs
 * flavor: matter.js's logger doesn't emit this chip-specific decode dump.
 */
export async function expectCommandInvoke(
    log: LogFollower,
    flavor: string,
    endpoint: number,
    cluster: number,
    command: number,
    fields: CommandFieldValue[],
    from: number,
    timeoutMs: number,
): Promise<CheckRecord> {
    let cursor = from;
    let last: { index: number; text: string } | undefined;

    try {
        const block = await expectAdjacentLines(
            log,
            flavor,
            commandPathIBSequence(endpoint, cluster, command),
            from,
            timeoutMs,
        );
        if (block.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }
        last = block.last;
        cursor = block.last.index + 1;

        for (const { id, value } of fields) {
            // Every field checked by any TC using this helper so far is an unsigned int (uint16/uint32);
            // chip's decode dump appends the TLV type name after the value (verified against a real
            // chip-bridge-app capture).
            const pattern = new RegExp(`0x${id.toString(16)} = ${value} \\(unsigned\\),\\s*$`);
            const result = await log.expect({ chip: pattern }, { flavor, timeoutMs, from: cursor });
            if (result.verdict === "unverified") {
                return { type: "device-log", verdict: "unverified" };
            }
            last = result.matched;
            cursor = result.matched.index + 1;
        }
    } catch (e) {
        // A timed-out or closed-mid-wait `log.expect` throws rather than returning a verdict — without
        // this, the step's log check would be missing from the evidence bundle entirely (only the
        // always-present "response" check would survive), the one piece of evidence a failed log match
        // most needs to carry.
        if (e instanceof CertLogTimeoutError) {
            return { type: "device-log", verdict: "fail", pattern: e.pattern, detail: e.message };
        }
        if (e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", detail: e.message };
        }
        throw e;
    }

    return {
        type: "device-log",
        verdict: "pass",
        pattern: `CommandDataIB CommandId=0x${command.toString(16)}, fields=${JSON.stringify(fields)}`,
        matched: last?.text,
        logLine: last?.index,
    };
}

// A caller-supplied /g or /y pattern keeps lastIndex between calls; reused as-is across the repeated
// test() calls below, that state silently skips matches. Stripping once yields a pattern countMatches
// can test() against every line safely (mirrors LogFollower.expect's own private copy of this fix).
function matchableCopy(pattern: RegExp): RegExp {
    return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
}

/**
 * Synchronous count of lines at or after `from` matching `pattern`, skipping
 * {@link LogLine.synthetic} lines the same way {@link LogFollower.expect} does — for a "repeat N
 * times, expect N successes" check. `flavor` is currently unused; every pattern this module exports
 * is chip-only.
 */
export function countMatches(log: LogFollower, _flavor: string, pattern: RegExp, from: number): number {
    const matchable = matchableCopy(pattern);
    return log.lines.slice(from).filter(line => !line.synthetic && matchable.test(line.text)).length;
}

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
