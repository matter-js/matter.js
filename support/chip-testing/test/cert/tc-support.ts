/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, MatterError, Millis, Seconds, Time } from "@matter/main";
import type {
    AttributePathSpec,
    CertNodeRef,
    CertStepContext,
    CheckRecord,
    EventPathSpec,
    LogExpectResult,
    LogFollower,
    LogLine,
} from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError } from "@matter/testing";

/**
 * Bounds a device-log check's wait for a line the step has already caused — one the device writes
 * while answering the interaction the step drove, not one it writes after work of its own.
 */
export const LOG_TIMEOUT = Seconds(15);

/** A cert run left a fabric (and whatever it carries) behind on the TH. */
export class CertCleanupError extends MatterError {}

/** A check inside a step failed; the evidence record carrying the detail is already recorded. */
export class CertCheckFailedError extends MatterError {}

/**
 * Records `check` and fails the step on a `"fail"` verdict — `recorder.check()` only records, so a
 * step whose evidence must gate it has to throw for itself, which is the single easiest thing to
 * forget. `"unverified"` passes through: that is what a log check reports on a flavor nobody wrote a
 * pattern for, and it is not a failure (see the flavor-pattern policy in this directory's AGENTS.md).
 */
export function record(cx: CertStepContext, check: CheckRecord, what: string) {
    cx.recorder.check(check);
    if (check.verdict === "fail") {
        throw new CertCheckFailedError(`${what} check failed: ${JSON.stringify(check)}`);
    }
}

/**
 * Records every check and fails the step once at the end, so a step asserting several artifacts puts
 * all of them in the evidence — {@link record} in a loop stops at the first failure and leaves the
 * rest of the step's own claim unrecorded.
 *
 * Each check is built on demand rather than taken as a list, so a builder that throws on the fifth
 * artifact leaves the first four recorded; its error carries the step, as {@link record}'s does.
 */
export function recordAll(cx: CertStepContext, checks: readonly { check: () => CheckRecord; what: string }[]): void {
    const failed = new Array<string>();
    for (const { check, what } of checks) {
        const record = check();
        cx.recorder.check(record);
        if (record.verdict === "fail") {
            failed.push(`${what}: ${JSON.stringify(record)}`);
        }
    }
    if (failed.length) {
        throw new CertCheckFailedError(`${failed.length} of ${checks.length} checks failed: ${failed.join("; ")}`);
    }
}

/**
 * Tracks commissioned node refs by role for one cert-test run. Each controller's own
 * `decommission()` only removes *that controller's* fabric via its own CASE session, so cleanup has
 * to visit every role independently. Shared by `TC-IDM-2.1.test.ts`/`TC-ACT-3.2.test.ts`/
 * `TC-IDM-1.1.test.ts` (single "dut" role) and `TC-CADMIN-1.17.test.ts` (multiple controller roles).
 *
 * {@link decommissionAll} belongs in a TC's `certTest(...).finalize(...)` callback, which the engine
 * runs however the steps ended. So does anything else that keeps this map true to the TH: a
 * {@link clear} owed by a fabric the TH itself removed must not sit in a skippable step either.
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

    /**
     * Decommissions every role still holding a ref. A role is dropped before its own attempt, so a
     * failure is reported once rather than retried on a later call; every failure is collected and
     * thrown together, since a fabric surviving on the TH outlives this run and breaks the next one.
     */
    async decommissionAll(cx: CertStepContext): Promise<void> {
        const failures = new Array<string>();
        for (const [role, ref] of [...this.#refs]) {
            this.#refs.delete(role);
            try {
                await cx.controllers[role].node(ref).decommission();
            } catch (e) {
                failures.push(`${role}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        if (failures.length) {
            throw new CertCleanupError(`Failed to decommission ${failures.join("; ")}`);
        }
    }

    /**
     * Requires `role`'s ref up front and threads it into `run`, matching the `(cx, ref)` shape most
     * single-DUT steps want.
     */
    withRef(
        role: Role,
        run: (cx: CertStepContext, ref: CertNodeRef) => Promise<void>,
    ): (cx: CertStepContext) => Promise<void> {
        return async cx => {
            const ref = this.require(role, `Step ran before the ${role.toUpperCase()} was commissioned`);
            await run(cx, ref);
        };
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
 * whole search shares one `timeout` budget.
 */
export async function expectAdjacentLines(
    log: LogFollower,
    flavor: string,
    sequence: RegExp[],
    from: number,
    timeout: Duration,
): Promise<{ verdict: "unverified" } | { verdict: "pass"; last: LogLine }> {
    const deadline = Time.nowMs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowMs));

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
export const REPORT_DATA_MESSAGE = /\[DMG\] ReportDataMessage =\s*$/;

// A subscription's own reports and its SubscribeResponse both carry the id the TH minted for it,
// printed as the block's first field in chip's own unpadded lowercase hex — captured verbatim in
// Test_TC_IDM_4_4.yaml. Correlating on it is what attributes a report to one subscription when
// several are live at once.
export const SUBSCRIBE_RESPONSE_MESSAGE = /\[DMG\] SubscribeResponseMessage =\s*$/;
export const SUBSCRIPTION_ID_LINE = /SubscriptionId = 0x([0-9a-f]+),\s*$/;

/** matter.js names the subscription it just minted on the response that carries it. */
const MATTERJS_SUBSCRIBE_RESPONSE = /Message » for: I\/SubscribeResponse sub#: ([0-9a-f]+)/;

/**
 * matter.js's own outgoing report, tagged with the subscription it belongs to and the message counter
 * its ack will name. A report says how much it carries — `attr:` for attributes, `ev:` for events —
 * where the keepalive an idle subscription sends at its maximum interval is marked `empty`, and a
 * keepalive's ack must not stand in for a report's.
 */
function matterjsReportPattern(subscriptionId: number): RegExp {
    return new RegExp(
        `Message » for: I/ReportData sub#: ${matterjsSubscriptionIdOf(subscriptionId)} (?:attr|ev): \\d+.*?✉([0-9a-f]+)`,
    );
}

/** As `Subscription.idStrOf` renders it (`hex.fixed(id, 8)`); an unpadded id matches no line at all. */
function matterjsSubscriptionIdOf(subscriptionId: number): string {
    return subscriptionId.toString(16).padStart(8, "0");
}

/**
 * The DUT's answer to the report `counter` identifies, whose payload is a `StatusResponseMessage`:
 * an anonymous structure whose context tag 0 holds the status, so `152400` opens it and the byte after
 * is the status itself (Matter Core § 8.9.2.3, § A.7.3).
 */
function matterjsReportAckPattern(counter: string): RegExp {
    return new RegExp(`Message « for: I/StatusResponse .*acked: ${counter} .*?payload: 152400([0-9a-f]{2})`);
}

export function subscriptionIdPattern(subscriptionId: number): RegExp {
    return new RegExp(`SubscriptionId = 0x${subscriptionId.toString(16)},\\s*$`);
}

// chip's raw stdout, as LogFollower captures it, names the top-level request message in the
// `[DMG] <MessageName> =` shape below — the same shape as REPORT_DATA_MESSAGE above. The connectedhomeip
// YAML docs print these captures as `CHIP:DMG: <MessageName> =` instead; that's the docs' own
// rendering, not the text LogFollower ever sees.
export const READ_REQUEST_MESSAGE = /\[DMG\] ReadRequestMessage =\s*$/;
export const WRITE_REQUEST_MESSAGE = /\[DMG\] WriteRequestMessage =\s*$/;
export const INVOKE_REQUEST_MESSAGE = /\[DMG\] InvokeRequestMessage =\s*$/;
export const SUBSCRIBE_REQUEST_MESSAGE = /\[DMG\] SubscribeRequestMessage =\s*$/;

/** Opens the event-path list of a read or subscribe request (`EventPathIBs::Parser::PrettyPrint`). */
export const EVENT_PATH_IBS_SEQUENCE = [/EventPathIBs =\s*$/, /\[\s*$/];

/**
 * The `isFabricFiltered` field a read or subscribe request carries, which chip prints with a trailing
 * space (`ReadRequestMessage.cpp`).
 */
export function fabricFilteredPattern(fabricFiltered: boolean): RegExp {
    return new RegExp(`isFabricFiltered = ${fabricFiltered},\\s*$`);
}

// chip's StatusResponseMessage decode dump carries the numeric status on its own nested line, not
// on the same line as the message name — verified against Test_TC_IDM_4_1.yaml's captured
// subscribe-establishment blocks (`Status = 0x00 (SUCCESS),`). The capital "Status" is
// StatusResponseMessage::Parser::PrettyPrint's own field specifically (StatusResponseMessage.cpp);
// a write's AttributeStatusIB and an invoke's CommandStatusIB both delegate their nested status to
// StatusIB::Parser::PrettyPrint, which prints lowercase "status" (StatusIB.cpp) — so this pattern
// does not also match a write/invoke response's own per-item status, only a genuine
// StatusResponseMessage. It does match any StatusResponseMessage regardless of which prior action
// it acknowledges (a report, a write, ...); a caller needing to attribute one to a specific action
// still needs to anchor on that action's own preceding log line, not on this pattern alone.
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

/**
 * {@link attributePathIBSequence}'s event counterpart: `EventPathIB::Parser::PrettyPrint`'s own
 * consecutive lines, in its fixed Node/Endpoint/Cluster/Event order, with no line for an absent
 * (wildcarded) field. Unlike an `AttributePathIB`, the block's opening line is `EventPath =` and its
 * closing line carries a comma, and the event id is bare lowercase hex rather than a padded MEI.
 */
export function eventPathIBSequence(fields: EventPathSpec): RegExp[] {
    const sequence = [/EventPath =\s*$/, /\{\s*$/];
    if (fields.endpoint !== undefined) {
        sequence.push(new RegExp(`Endpoint = 0x${fields.endpoint.toString(16)},\\s*$`));
    }
    if (fields.cluster !== undefined) {
        sequence.push(new RegExp(`Cluster = 0x${fields.cluster.toString(16)},\\s*$`));
    }
    if (fields.event !== undefined) {
        sequence.push(new RegExp(`Event = 0x${fields.event.toString(16)},\\s*$`));
    }
    sequence.push(/\},\s*$/);
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
 * Records whether `sequence` matches consecutive log lines at or after `from` (see
 * {@link expectAdjacentLines}) as a check, with `label` naming what the sequence stands for in the
 * evidence. A timeout or a source closing mid-wait is recorded `"fail"` rather than propagating, so a
 * step's own evidence carries the miss.
 */
export async function expectSequence(
    log: LogFollower,
    flavor: string,
    label: string,
    sequence: RegExp[],
    from: number,
    timeout: Duration,
): Promise<CheckRecord> {
    try {
        const result = await expectAdjacentLines(log, flavor, sequence, from, timeout);
        if (result.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }
        return {
            type: "device-log",
            verdict: "pass",
            pattern: label,
            matched: result.last.text,
            logLine: result.last.index,
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", pattern: label, detail: e.message, logLine: from };
        }
        throw e;
    }
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
    timeout: Duration,
): Promise<CheckRecord> {
    const result = await expectAdjacentLines(log, flavor, attributePathIBSequence(fields), from, timeout);
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
 * waits share `timeout`'s deadline; a timeout or closed source from either stage is recorded as a
 * `"fail"` rather than propagating uncaught.
 */
export async function expectMessageWithPath(
    log: LogFollower,
    flavor: string,
    message: RegExp,
    fields: AttributePathSpec,
    from: number,
    timeout: Duration,
): Promise<CheckRecord> {
    const deadline = Time.nowMs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowMs));

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
    timeout: Duration,
): Promise<CheckRecord> {
    let cursor = from;
    let last: { index: number; text: string } | undefined;

    // One deadline for the whole check, not one per wait: a per-wait budget makes the worst case
    // timeout × (1 + fields.length), where the caller asked for timeout
    const deadline = Time.nowMs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowMs));

    try {
        const block = await expectAdjacentLines(
            log,
            flavor,
            commandPathIBSequence(endpoint, cluster, command),
            from,
            remaining(),
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
            const result = await log.expect({ chip: pattern }, { flavor, timeoutMs: remaining(), from: cursor });
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

// How long a further report chunk may take to surface before the transfer counts as finished. The
// read has already returned by the time a step checks, so this covers the follower's pump lag only.
const CHUNK_QUIET = Seconds(2);

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
    timeout: Duration,
): Promise<CheckRecord> {
    const deadline = Time.nowMs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowMs));

    const chunks = new Array<LogLine>();
    for (;;) {
        // The second chunk is what proves the read chunked at all, so it gets the whole remaining
        // budget; every later one only has to outlast pump lag, and its absence ends the transfer.
        const timeout = chunks.length > 1 ? Duration.min(CHUNK_QUIET, remaining()) : remaining();
        let next: LogExpectResult;
        try {
            next = await log.expect(
                { chip: REPORT_DATA_MESSAGE },
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
            pattern: String(REPORT_DATA_MESSAGE),
            detail: `${chunks.length} report chunks — the read did not chunk`,
            logLine: chunks[0]?.index,
        };
    }

    // One transfer stays on one exchange, so this is what makes the chunks *one* read's rather than
    // several reads' — and, like expectReportAck, what tells this read's acks from those of the node's
    // own subscription, which stays live during these runs.
    const exchange = exchangeIdBefore(log, chunks[0].index);
    if (exchange === undefined) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern: String(REPORT_SENT_LINE),
            detail:
                "No outbound Report Data trace line (carrying an Exchange id) found before the report " +
                `chunk at log line ${chunks[0].index}`,
            logLine: chunks[0].index,
        };
    }

    for (const [i, chunk] of chunks.entries()) {
        const chunkExchange = exchangeIdBefore(log, chunk.index);
        if (chunkExchange !== exchange) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern: String(REPORT_SENT_LINE),
                detail:
                    `The report chunk at log line ${chunk.index} went out on Exchange ` +
                    `${chunkExchange ?? "(none)"}, not ${exchange}, so chunk ${i + 1} of ${chunks.length} ` +
                    "belongs to another read",
                logLine: chunk.index,
            };
        }
    }

    const ackPattern = reportAckedOnExchange(exchange);
    const lines = log.lines;
    for (let i = 1; i < chunks.length; i++) {
        const acked = lines
            .slice(chunks[i - 1].index + 1, chunks[i].index)
            .some(line => !line.synthetic && ackPattern.test(line.text));
        if (!acked) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern: String(ackPattern),
                detail:
                    `No StatusResponse on Exchange ${exchange} between the report chunks at log lines ` +
                    `${chunks[i - 1].index} and ${chunks[i].index} (chunk ${i} of ${chunks.length} went unacked)`,
                logLine: chunks[i].index,
            };
        }
    }

    return {
        type: "device-log",
        verdict: "pass",
        pattern: "ReportDataMessage, StatusResponse on the same Exchange between every adjacent pair",
        detail: `${chunks.length} report chunks, each but the last followed by a StatusResponse`,
        matched: chunks[chunks.length - 1].text,
        logLine: chunks[chunks.length - 1].index,
    };
}

/**
 * What reading a subscription id off a TH's log produced, as three outcomes rather than one optional
 * field. Every caller today records `check` through {@link record} first, so a failed lookup fails the
 * step before any consumer sees it; the union is what keeps that true if one ever forgets, since a
 * consumer cannot then treat a failure as a flavor that had nothing to say.
 */
export type SubscriptionIdLookup =
    /** The TH named it. */
    | { outcome: "found"; subscriptionId: number; check: CheckRecord }
    /**
     * No pattern for this flavor. Unreachable while the flavors are chip and matterjs — both name
     * their subscriptions — and the handling exists for a flavor added without a pattern.
     */
    | { outcome: "unnamed"; check: CheckRecord }
    /** The lookup itself failed; `check` carries why. */
    | { outcome: "failed"; check: CheckRecord };

async function matterjsSubscriptionId(
    log: LogFollower,
    flavor: string,
    from: number,
    timeout: Duration,
): Promise<SubscriptionIdLookup> {
    const pattern = String(MATTERJS_SUBSCRIBE_RESPONSE);
    let response: LogExpectResult;
    try {
        response = await log.expect({ matterjs: MATTERJS_SUBSCRIBE_RESPONSE }, { flavor, timeoutMs: timeout, from });
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return {
                outcome: "failed",
                check: { type: "device-log", verdict: "fail", pattern, detail: e.message, logLine: from },
            };
        }
        throw e;
    }
    if (response.verdict === "unverified") {
        return { outcome: "unnamed", check: { type: "device-log", verdict: "unverified" } };
    }

    const id = MATTERJS_SUBSCRIBE_RESPONSE.exec(response.matched.text)?.[1];
    if (id === undefined) {
        return {
            outcome: "failed",
            check: {
                type: "device-log",
                verdict: "fail",
                pattern,
                detail: `SubscribeResponse carries no readable subscription id: ${response.matched.text}`,
                logLine: response.matched.index,
            },
        };
    }

    return {
        outcome: "found",
        subscriptionId: parseInt(id, 16),
        check: {
            type: "device-log",
            verdict: "pass",
            pattern,
            matched: response.matched.text,
            logLine: response.matched.index,
        },
    };
}

/**
 * Reads back the id the TH minted for the subscription whose SubscribeResponse it sends at or after
 * `from`. Every step here keeps its subscriptions (`keepSubscriptions: true`) and their max interval
 * is shorter than the whole run, so several subscriptions report concurrently from step 3 onward —
 * the id is what tells one step's reports from another's. Both flavors name it: chip in its decode
 * dump, matter.js on the response itself.
 */
export async function expectSubscriptionId(
    log: LogFollower,
    flavor: string,
    from: number,
    timeout: Duration,
): Promise<SubscriptionIdLookup> {
    if (flavor === "matterjs") {
        return matterjsSubscriptionId(log, flavor, from, timeout);
    }

    const sequence = [SUBSCRIBE_RESPONSE_MESSAGE, /\{\s*$/, SUBSCRIPTION_ID_LINE];
    try {
        const result = await expectAdjacentLines(log, flavor, sequence, from, timeout);
        if (result.verdict === "unverified") {
            return { outcome: "unnamed", check: { type: "device-log", verdict: "unverified" } };
        }

        const id = SUBSCRIPTION_ID_LINE.exec(result.last.text)?.[1];
        if (id === undefined) {
            return {
                outcome: "failed",
                check: {
                    type: "device-log",
                    verdict: "fail",
                    pattern: String(SUBSCRIPTION_ID_LINE),
                    detail: `SubscribeResponseMessage carries no readable subscription id: ${result.last.text}`,
                    logLine: result.last.index,
                },
            };
        }

        return {
            outcome: "found",
            subscriptionId: parseInt(id, 16),
            check: {
                type: "device-log",
                verdict: "pass",
                pattern: String(SUBSCRIBE_RESPONSE_MESSAGE),
                matched: result.last.text,
                logLine: result.last.index,
            },
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return {
                outcome: "failed",
                check: {
                    type: "device-log",
                    verdict: "fail",
                    pattern: String(SUBSCRIBE_RESPONSE_MESSAGE),
                    detail: e.message,
                    logLine: from,
                },
            };
        }
        throw e;
    }
}

// chip's own trace line for an outbound message — printed once, immediately before that message's
// raw/decode dump — names the CHIP Exchange id it was sent on (verified against a real capture:
// `>> to UDP:[...] | <msgCounter> | [Interaction Model  (1) / Report Data (0x05) / Session = <s> /
// Exchange = <id>]`). Matter Core's MRP (§ 4.12) always acks a message on the exchange it was
// received on, and the same capture shows the DUT's ack line naming that identical id, so this is
// what ties one specific report to one specific ack even though the two lines aren't adjacent (a
// variable amount of raw-frame/decode-dump content sits between a trace line and its own message
// name line, depending on payload size).
const REPORT_SENT_LINE = /\[DMG\] >> to UDP:.*\/ Report Data \(0x05\) \/ Session = \d+ \/ Exchange = (\d+)\]\s*$/;

function reportAckedOnExchange(exchange: string): RegExp {
    return new RegExp(
        `\\[DMG\\] << from UDP:.*/ Status Response \\(0x01\\) / Session = \\d+ / Exchange = ${exchange}\\]\\s*$`,
    );
}

// The acknowledging message's own decode dump, which chip prints directly after the trace line above:
// `StatusResponseMessage =`, `{`, then the status as its first nested field
// (StatusResponseMessage::Parser::PrettyPrint). The status must be read out of *this* block — a
// forward search for a success line instead finds the next ack in the stream, and a run acks one
// report per write per live subscription, so a rejected report would be reported as accepted.
const STATUS_RESPONSE_MESSAGE = /\[DMG\] StatusResponseMessage =\s*$/;
const OPENING_BRACE = /\{\s*$/;
// chip renders the status as `0x%02x (%s)` with `StatusName` for the name, and those names are not all
// SCREAMING_SNAKE_CASE: a deprecated or reserved code is named after its own value (`Deprecated82`) and
// a code outside chip's list is not named at all (`Unallocated`).
const ANY_STATUS_LINE = /Status = 0x[\da-fA-F]+ \(\w+\),?\s*$/;

// How far back from a matched ReportDataMessage's own decode dump to look for its trace line —
// generous relative to the largest gap seen in a real capture (chunked multi-attribute priming
// reports, tens of lines), so this is a runaway-loop guard, not a tuned bound.
const EXCHANGE_LOOKBACK_LINES = 1000;

/**
 * The trace line naming a message's own Exchange id is the *nearest* one preceding that message's
 * decode dump: chip logs one message at a time, so no other message's own trace line can land in
 * between. Scanning backward from the decode dump (rather than forward from a fixed cursor) is what
 * makes this correct regardless of how many raw-frame lines chip printed for this particular
 * message's payload size.
 */
function exchangeIdBefore(log: LogFollower, beforeIndex: number): string | undefined {
    return log.lastMatchBefore(REPORT_SENT_LINE, beforeIndex, EXCHANGE_LOOKBACK_LINES)?.match[1];
}

/**
 * As {@link expectReportAck} against a matter.js TH, which names both the subscription a report
 * belongs to and the message counter its ack carries — so the ack is matched to this very report
 * rather than to whatever answered on the same exchange next.
 */
async function matterjsReportAck(
    log: LogFollower,
    flavor: string,
    subscriptionId: number,
    from: number,
    timeout: Duration,
): Promise<CheckRecord> {
    const deadline = Time.nowMs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowMs));
    const reportPattern = matterjsReportPattern(subscriptionId);
    const pattern = `${reportPattern} then its own Success StatusResponse`;

    try {
        const report = await log.expect({ matterjs: reportPattern }, { flavor, timeoutMs: remaining(), from });
        if (report.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const counter = reportPattern.exec(report.matched.text)?.[1];
        if (counter === undefined) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern,
                detail: `Report carries no readable message counter: ${report.matched.text}`,
                logLine: report.matched.index,
            };
        }

        const ackPattern = matterjsReportAckPattern(counter);
        const ack = await log.expect(
            { matterjs: ackPattern },
            { flavor, timeoutMs: remaining(), from: report.matched.index + 1 },
        );
        if (ack.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const status = ackPattern.exec(ack.matched.text)?.[1];
        if (status !== "00") {
            return {
                type: "device-log",
                verdict: "fail",
                pattern,
                detail: `The DUT acked our report with status 0x${status}`,
                logLine: ack.matched.index,
            };
        }

        return {
            type: "device-log",
            verdict: "pass",
            pattern,
            matched: ack.matched.text,
            logLine: ack.matched.index,
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", pattern, detail: e.message, logLine: from };
        }
        throw e;
    }
}

/**
 * Confirms the TH sent a report on subscription `subscriptionId` at or after `from` and that the DUT
 * answered *that specific report* with a Success StatusResponse. The subscription id alone only
 * proves the report is ours; several subscriptions' report/ack cycles can be in flight over the
 * seconds it takes chip to send a report and receive its ack, so a plain "next Success StatusResponse
 * after this report" search can still land on a different subscription's ack landing in that window.
 * This closes that gap by reading the CHIP Exchange id our report was sent on (see
 * {@link REPORT_SENT_LINE}) and requiring the ack to arrive on that same exchange — a different
 * subscription's own report/ack pair carries its own, different exchange id, so it can no longer
 * stand in for ours.
 *
 * Against a matter.js TH the correlation is tighter still: it names the message counter each ack
 * carries, so the ack is matched to this very report rather than to whatever answered on the same
 * exchange next.
 */
export async function expectReportAck(
    log: LogFollower,
    flavor: string,
    subscription: SubscriptionIdLookup,
    from: number,
    timeout: Duration,
): Promise<CheckRecord> {
    // Takes the lookup rather than its id so a failure cannot arrive here as an unverified nobody can
    // explain. Callers gate on `check` first, so this is the second line of defence, not the first.
    if (subscription.outcome !== "found") {
        return subscription.check;
    }
    const { subscriptionId } = subscription;

    if (flavor === "matterjs") {
        return matterjsReportAck(log, flavor, subscriptionId, from, timeout);
    }

    const deadline = Time.nowMs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowMs));
    const pattern = `ReportDataMessage(SubscriptionId = 0x${subscriptionId.toString(16)}) then its own ${STATUS_RESPONSE_SUCCESS} (matched by Exchange id)`;

    try {
        const report = await expectAdjacentLines(
            log,
            flavor,
            [REPORT_DATA_MESSAGE, /\{\s*$/, subscriptionIdPattern(subscriptionId)],
            from,
            remaining(),
        );
        if (report.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const exchange = exchangeIdBefore(log, report.last.index);
        if (exchange === undefined) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern,
                detail: `No outbound Report Data trace line (carrying an Exchange id) found before line ${report.last.index}`,
                logLine: report.last.index,
            };
        }

        const ackHeader = await log.expect(
            { chip: reportAckedOnExchange(exchange) },
            { flavor, timeoutMs: remaining(), from: report.last.index + 1 },
        );
        if (ackHeader.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const messageName = await log.expect(
            { chip: STATUS_RESPONSE_MESSAGE },
            { flavor, timeoutMs: remaining(), from: ackHeader.matched.index + 1 },
        );
        if (messageName.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const brace = await log.expect(
            { chip: OPENING_BRACE },
            { flavor, timeoutMs: remaining(), from: messageName.matched.index + 1 },
        );
        if (brace.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const status = await log.expect(
            { chip: ANY_STATUS_LINE },
            { flavor, timeoutMs: remaining(), from: brace.matched.index + 1 },
        );
        if (status.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        // Reading anything but this block's own first two lines means the dump did not have the shape
        // this check reasons about, so the status found cannot be attributed to our ack.
        if (brace.matched.index !== messageName.matched.index + 1 || status.matched.index !== brace.matched.index + 1) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern,
                detail:
                    `StatusResponseMessage at line ${messageName.matched.index} is not followed by "{" and a ` +
                    `status line (found "{" at ${brace.matched.index}, status at ${status.matched.index})`,
                logLine: messageName.matched.index,
            };
        }

        if (!STATUS_RESPONSE_SUCCESS.test(status.matched.text)) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern,
                detail: `The DUT acked our report with ${status.matched.text.trim()}`,
                matched: status.matched.text,
                logLine: status.matched.index,
            };
        }

        return {
            type: "device-log",
            verdict: "pass",
            pattern,
            matched: status.matched.text,
            logLine: status.matched.index,
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", pattern, detail: e.message, logLine: from };
        }
        throw e;
    }
}

/**
 * How an operation a step was waiting for ended, and how long it took, formatted for the evidence.
 * A `"timeout"` says only that the wait ended: the operation itself is still running.
 */
export type SettleReport<T = unknown> = { elapsed: string } & (
    | { kind: "resolved"; value: T }
    | { kind: "rejected"; error: unknown }
    | { kind: "timeout" }
);

/**
 * Waits for `op` to settle, bounded by `timeout` so an implementation that neither answers nor
 * gives up cannot hang the step for the whole mocha timeout. Reports which way it went, for a step
 * that has something to record either way; {@link expectRejection} is the form for a step that
 * demands a refusal.
 *
 * A step that stops waiting is still responsible for what the operation does afterwards — a
 * commissioning that succeeds late leaves a fabric on the device.
 */
export async function settleWithin<T>(label: string, op: Promise<T>, timeout: Duration): Promise<SettleReport<T>> {
    // nowUs is the monotonic clock despite the name; nowMs tracks UTC and a step of it would put a
    // negative elapsed into the evidence
    const start = Time.nowUs;
    const elapsed = () => Duration.format(Millis(Time.nowUs - start));
    const timer = Time.sleep(`${label} settle timeout`, timeout);

    try {
        return await Promise.race([
            op.then(
                (value): SettleReport<T> => ({ kind: "resolved", value, elapsed: elapsed() }),
                (error: unknown): SettleReport<T> => ({ kind: "rejected", error, elapsed: elapsed() }),
            ),
            timer.then((): SettleReport<T> => ({ kind: "timeout", elapsed: elapsed() })),
        ]);
    } finally {
        // A lost race leaves the sleep armed for its full duration, keeping the process alive past teardown
        timer.cancel();
    }
}

/**
 * Asserts `op` rejects rather than resolves, bounded by `timeout` so an implementation that
 * neither errors nor gives up cannot hang the step for the whole mocha timeout — which is useless as
 * either evidence or a fast local failure. A timeout is reported `"fail"`, same as an unexpected
 * success, and the elapsed time reaches the evidence either way.
 *
 * `accept` narrows *which* rejection counts. Without it any error passes, including one that says
 * nothing about the behaviour under test — a controller that crashed, timed out or was never asked.
 * A step whose evidence is "it failed" rather than "it failed for this reason" should pass one.
 */
export async function expectRejection(
    label: string,
    op: Promise<unknown>,
    timeout: Duration,
    accept?: (error: unknown) => boolean,
): Promise<CheckRecord> {
    const outcome = await settleWithin(label, op, timeout);
    const { elapsed } = outcome;

    switch (outcome.kind) {
        case "resolved":
            return { type: "response", verdict: "fail", detail: `${label} unexpectedly succeeded after ${elapsed}` };
        case "timeout":
            return {
                type: "response",
                verdict: "fail",
                detail: `${label} neither resolved nor rejected within ${Duration.format(timeout)}`,
            };
        case "rejected": {
            const { error } = outcome;
            const message = error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);
            if (accept !== undefined && !accept(error)) {
                return {
                    type: "response",
                    verdict: "fail",
                    detail: `${label} failed after ${elapsed} for an unrelated reason: ${message}`,
                };
            }
            return { type: "response", verdict: "pass", detail: `${label} rejected after ${elapsed}: ${message}` };
        }
    }
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
