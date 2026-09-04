/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    camelize,
    Duration,
    InternalError,
    MatterAggregateError,
    MatterError,
    Millis,
    Seconds,
    Time,
} from "@matter/main";
import type { ClusterModel } from "@matter/model";
import { Matter } from "@matter/model";
import type {
    AttributePathSpec,
    CertNodeApi,
    CertNodeRef,
    CertStepContext,
    CheckRecord,
    EventPathSpec,
    LogExpectPatterns,
    LogExpectResult,
    LogExpectSequences,
    LogFollower,
    LogLine,
} from "@matter/testing";
import { CertLogClosedError, CertLogTimeoutError, forFlavor } from "@matter/testing";

/**
 * Bounds a device-log check's wait for a line the step has already caused — one the device writes
 * while answering the interaction the step drove, not one it writes after work of its own.
 */
export const LOG_TIMEOUT = Seconds(15);

const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const OPERATIONAL_CREDENTIALS_ID = requireId(OPERATIONAL_CREDENTIALS.id, "OperationalCredentials cluster");
const CURRENT_FABRIC_INDEX_ID = requireId(
    OPERATIONAL_CREDENTIALS.attributes.require("currentFabricIndex").id,
    "OperationalCredentials.currentFabricIndex",
);

/** A cert run left a fabric (and whatever it carries) behind on the TH. */
export class CertCleanupError extends MatterError {}

/** A check inside a step failed; the evidence record carrying the detail is already recorded. */
export class CertCheckFailedError extends MatterError {}

/**
 * Records `check` and fails the step on a `"fail"` verdict — `recorder.check()` only records, so a
 * step whose evidence must gate it has to throw for itself, which is the single easiest thing to
 * forget. `"unverified"` passes through rather than throwing: that is what a log check reports on a
 * flavor nobody wrote a pattern for, and the engine makes it the step's verdict (see the
 * flavor-pattern policy in this directory's AGENTS.md).
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
 * Several cleanups of one TC's finalizer having failed. The engine records a finalization failure as
 * the error's `message` alone, so every failure has to be named there; the causes travel along for a
 * reader who also has the console output.
 */
export class CertCleanupErrors extends MatterAggregateError {
    constructor(causes: unknown[]) {
        super(causes, causes.map(cause => describeError(cause)).join("; "));
    }
}

/**
 * Runs every cleanup a TC owes, in order, whatever any of them does.
 *
 * A `try { a() } finally { b() }` runs both but reports only `b`'s failure, and each of a TC's
 * cleanups names different state the next run inherits — an outstanding commissioning attempt and a
 * fabric on the TH are not substitutes for one another. A lone failure is rethrown as it arrived so
 * its own type survives; several become one {@link CertCleanupErrors}.
 *
 * {@link MatterAggregateError.settleSeries} runs a series the same way but names it with a fixed
 * message, and the message is all the evidence bundle keeps.
 */
export async function runCleanups(...cleanups: (() => Promise<void>)[]): Promise<void> {
    const failures = new Array<unknown>();
    for (const cleanup of cleanups) {
        try {
            await cleanup();
        } catch (e) {
            failures.push(e);
        }
    }

    if (failures.length === 1) {
        throw failures[0];
    }
    if (failures.length) {
        throw new CertCleanupErrors(failures);
    }
}

/** An error as evidence text, naming its class as well as its message. */
export function describeError(e: unknown): string {
    return e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
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
 * Waits for the sequence `sequences` holds for `flavor`'s implementation to match a run of
 * CONSECUTIVE log lines anywhere at or after `from`. Resolves `"unverified"` where it holds none.
 *
 * A candidate that matches the sequence's first pattern but whose following lines don't stay
 * adjacent is some *other* block sharing the same opening (e.g. a ReportData `AttributePathIB`
 * carrying an extra `Attribute =` line where the request's wildcard block has none, possibly still
 * in flight from an earlier step — the follower pumps the device stream asynchronously, so a
 * previous step's response can surface after this step's `mark()`). Such a candidate is skipped and
 * the search resumes at the next one; genuine absence of the block surfaces as
 * `log.expectPattern`'s own timeout error. The whole search shares one `timeout` budget.
 */
export async function expectAdjacentLines(
    log: LogFollower,
    flavor: string,
    sequences: LogExpectSequences,
    from: number,
    timeout: Duration,
): Promise<{ verdict: "unverified" } | { verdict: "pass"; last: LogLine }> {
    const sequence = forFlavor(sequences, flavor);
    if (sequence === undefined) {
        return { verdict: "unverified" };
    }
    return { verdict: "pass", last: await adjacentRun(log, sequence, from, timeout) };
}

async function adjacentRun(log: LogFollower, sequence: RegExp[], from: number, timeout: Duration): Promise<LogLine> {
    const deadline = Time.nowUs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowUs));

    let cursor = from;
    for (;;) {
        const anchor = await log.expectPattern(sequence[0], { timeoutMs: remaining(), from: cursor });

        let last = anchor;
        let interleaved = false;
        for (const pattern of sequence.slice(1)) {
            const matched = await log.expectPattern(pattern, { timeoutMs: remaining(), from: last.index + 1 });
            if (matched.index !== last.index + 1) {
                interleaved = true;
                break;
            }
            last = matched;
        }

        if (!interleaved) {
            return last;
        }
        cursor = anchor.index + 1;
    }
}

/**
 * Waits for every pattern of `sequence` to match a line at or after `from`, in order, with anything at
 * all allowed in between — for a claim its implementation states across lines its own handlers emit
 * rather than in one block. Shares one `timeout` budget, as {@link adjacentRun} does.
 */
async function orderedRun(log: LogFollower, sequence: RegExp[], from: number, timeout: Duration): Promise<LogLine> {
    const deadline = Time.nowUs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowUs));

    let last: LogLine | undefined;
    for (const pattern of sequence) {
        last = await log.expectPattern(pattern, {
            timeoutMs: remaining(),
            from: last === undefined ? from : last.index + 1,
        });
    }
    if (last === undefined) {
        throw new InternalError("An ordered log expectation was given no patterns");
    }
    return last;
}

// chip's DMG log dumps a ReportDataMessage every time the read handler sends one chunk, and an
// inbound StatusResponse every time it receives the DUT's per-chunk ack — verified against a real
// chip-all-clusters-app's log for a >1-MTU wildcard read (repeated ReportDataMessage/StatusResponse
// pairs).
export const REPORT_DATA_MESSAGE = /\[DMG\] ReportDataMessage =\s*$/;

// A subscription's own reports and its SubscribeResponse both carry the id the TH minted for it,
// printed as the block's first field in chip's own unpadded lowercase hex — captured verbatim in
// Test_TC_IDM_4_4.yaml. Correlating on it is what attributes a report to one subscription when
// several are live at once.
export const SUBSCRIBE_RESPONSE_MESSAGE = /\[DMG\] SubscribeResponseMessage =\s*$/;

/**
 * What a report carries, on the line chip prints right after the subscription id.
 *
 * A report carrying neither prints `InteractionModelRevision` here instead, and two very different
 * reports have that shape: the keepalive an idle subscription sends at its maximum interval, and the
 * priming report of a subscription established with nothing to report yet. Both are acked like any
 * report, so nothing downstream of the ack tells them from a report either — which is why requiring
 * this line is the caller's choice (`expectReportAck`'s `carriesData`) rather than always on. A
 * chip-local TC-IDM-4.1 run's device log holds six of the first kind.
 */
export const REPORT_DATA_IBS = /(?:Attribute|Event)ReportIBs =\s*$/;
export const SUBSCRIPTION_ID_LINE = /SubscriptionId = 0x([0-9a-f]+),\s*$/;

/** matter.js names the subscription it just minted on the response that carries it. */
const MATTERJS_SUBSCRIBE_RESPONSE = /Message » for: I\/SubscribeResponse sub#: ([0-9a-f]+)/;

/**
 * matter.js's own outgoing report, tagged with the subscription it belongs to and the message counter
 * its ack will name. A report says how much it carries — `attr:` for attributes, `ev:` for events —
 * where the keepalive an idle subscription sends at its maximum interval is marked `empty`, and a
 * keepalive's ack must not stand in for a report's.
 */
function matterjsReportPattern(subscriptionId: number, carriesData: boolean): RegExp {
    // matter.js prints the counts a report carried, and flags a report carrying neither as `empty`
    // (`InteractionMessenger`'s report logContext), so requiring the counts is what excludes a keepalive.
    const carried = carriesData ? "(?:attr|ev): \\d+" : "";
    return new RegExp(
        `Message » for: I/ReportData sub#: ${matterjsSubscriptionIdOf(subscriptionId)} ${carried}.*?✉([0-9a-f]+)`,
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
 * One implementation's lines for a claim: consecutive by default, or `{ ordered }` where that
 * implementation prints lines of its own in between — matter.js states one subscribe across the flags
 * of the request, the paths it carried and the intervals it accepted, with its own work logged
 * between them.
 */
export type FlavorLines = RegExp[] | { ordered: RegExp[] };

export interface LogExpectClaim {
    chip?: FlavorLines;
    matterjs?: FlavorLines;
}

/**
 * Records whether the running flavor's sequence matches consecutive log lines at or after `from` (see
 * {@link expectAdjacentLines}) as a check, with `label` naming what the sequence stands for in the
 * evidence. A timeout or a source closing mid-wait is recorded `"fail"` rather than propagating, so a
 * step's own evidence carries the miss.
 */
export async function expectSequence(
    log: LogFollower,
    flavor: string,
    label: string,
    claim: LogExpectClaim,
    from: number,
    timeout: Duration,
): Promise<CheckRecord> {
    const lines = forFlavor(claim, flavor);
    if (lines === undefined) {
        return { type: "device-log", verdict: "unverified" };
    }

    try {
        const last = Array.isArray(lines)
            ? await adjacentRun(log, lines, from, timeout)
            : await orderedRun(log, lines.ordered, from, timeout);
        return {
            type: "device-log",
            verdict: "pass",
            pattern: label,
            matched: last.text,
            logLine: last.index,
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", pattern: label, detail: e.message, logLine: from };
        }
        throw e;
    }
}

export interface DeviceLogCheck {
    check: CheckRecord;
    /** Cursor a subsequent, causally-later log check should search from. */
    from: number;
}

/**
 * Runs a single-pattern {@link LogFollower.expect} and converts every outcome (match, timeout, or a
 * closed follower) into a {@link CheckRecord} instead of letting the latter two propagate as thrown
 * errors, so a timed-out or closed-mid-wait check still lands in the evidence bundle rather than
 * vanishing. {@link expectSequence} is the equivalent for an expectation spanning several lines.
 */
export async function expectDeviceLog(
    log: LogFollower,
    flavor: string,
    patterns: LogExpectPatterns,
    from: number,
    timeout: Duration,
): Promise<DeviceLogCheck> {
    try {
        const result = await log.expect(patterns, { flavor, timeoutMs: timeout, from });
        if (result.verdict === "unverified") {
            return { check: { type: "device-log", verdict: "unverified" }, from };
        }
        return {
            check: {
                type: "device-log",
                verdict: "pass",
                pattern: result.pattern,
                matched: result.matched.text,
                logLine: result.matched.index,
            },
            from: result.matched.index + 1,
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError) {
            return { check: { type: "device-log", verdict: "fail", pattern: e.pattern, detail: e.message }, from };
        }
        if (e instanceof CertLogClosedError) {
            return { check: { type: "device-log", verdict: "fail", detail: e.message }, from };
        }
        throw e;
    }
}

/**
 * matter.js's own rendering of an attribute path, as its interaction log names every path an inbound
 * read, write or subscribe carried: `<endpoint>.<cluster>.state.<attribute>`, with no
 * `state.<attribute>` segment at all where the path names no attribute (`resolvePathForNode` in
 * `ProtocolService.ts`). Each element is its name where the node the log speaks for has that element,
 * and its bare lowercase hex id where a wildcard elsewhere in the path left it unresolved — the
 * pattern accepts either, since both are derived from the ids the step asked for.
 */
function matterjsPath(fields: AttributePathSpec): string {
    // matter.js resolves a name off the addressed endpoint's own cluster, so a path wildcarding
    // either the endpoint or the cluster names nothing at all, whatever the model knows.
    const resolvable = fields.endpoint !== undefined && fields.cluster !== undefined;
    const cluster = fields.cluster === undefined ? undefined : Matter.clusters(fields.cluster);

    const elements = [
        fields.endpoint === undefined ? "\\*" : `${fields.endpoint}`,
        matterjsElement(resolvable ? cluster?.name : undefined, fields.cluster),
    ];
    if (fields.attribute === undefined) {
        elements.push("\\*");
    } else {
        const attribute = resolvable ? cluster?.attributes(fields.attribute) : undefined;
        elements.push("state", matterjsElement(attribute?.name, fields.attribute));
    }

    return elements.join("\\.");
}

function matterjsElement(name: string | undefined, id: number | undefined): string {
    const hex = id === undefined ? "\\*" : `0x${id.toString(16)}`;
    return name === undefined ? hex : `(?:${camelize(name)}|${hex})`;
}

/**
 * matter.js's own announcement that a commissioning completed, naming the fabric the CASE session
 * that completed it belongs to — the equivalent of chip's "Commissioning completed successfully".
 */
export const MATTERJS_COMMISSIONED_FABRIC = /GeneralCommissioningClusterHandler Commissioned fabric:/;

/**
 * A `RemoveFabric` the device answered with success. matter.js's line is the invoke's own answer,
 * which names the fabric it removed and the status it answered with, where chip logs an unqualified
 * success line.
 */
export function removeFabricSucceeded(fabricIndex: number): LogExpectPatterns {
    return {
        chip: /OpCreds: RemoveFabric successful/,
        matterjs: new RegExp(
            `operationalCredentials\\.removeFabric .*statusCode: 0 fabricIndex: ${fabricIndex}(?!\\d)`,
        ),
    };
}

/**
 * The removed fabric's sessions going away. A matter.js session is named
 * `@<fabricIndex>:<fabricId>•<id>`, so one such line per session is what chip states once as
 * "Expiring all sessions for fabric N".
 */
export function fabricSessionsEnded(fabricIndex: number): LogExpectPatterns {
    return {
        chip: new RegExp(`Expiring all sessions for fabric 0x${fabricIndex.toString(16)}!!`),
        matterjs: new RegExp(`Session @${fabricIndex}:[0-9a-f]+•[0-9a-f]+ Session ended`),
    };
}

/**
 * The fabric index the TH assigned to `node`'s own controller, read over that controller's own session
 * — the only discriminator every controller has without setup. A fabric's `Label` is empty until an
 * admin writes one (Core § 11.18.6.2), so it identifies nothing for a harness that must work with any
 * controller implementation.
 */
export async function readOwnFabricIndex(node: CertNodeApi): Promise<number> {
    const value = await node.readAttribute({
        endpoint: 0,
        cluster: OPERATIONAL_CREDENTIALS_ID,
        attribute: CURRENT_FABRIC_INDEX_ID,
    });
    if (typeof value !== "number") {
        throw new InternalError(`Expected CurrentFabricIndex to read as a number, got ${JSON.stringify(value)}`);
    }
    return value;
}

// A path is one entry of a comma-separated list, so a match needs both ends bounded: without this,
// the path a step asked for matches as the tail of a longer endpoint number or the head of a longer
// element name, attributing another path's line to this check.
const MATTERJS_PATH_START = "(?<![\\w.*])";
const MATTERJS_PATH_END = "(?![\\w.*])";

// The read's own paths, not the event paths that follow them on the same line: a wildcard event path
// renders exactly as a wildcard attribute path does, so an unbounded search finds one for a read that
// asked for something else entirely.
function matterjsReadPath(fields: AttributePathSpec): RegExp {
    return new RegExp(
        `InteractionServer Read «.*attributes: (?:(?! events:).)*?${MATTERJS_PATH_START}${matterjsPath(fields)}${MATTERJS_PATH_END}`,
    );
}

// A write's paths are the whole tail of the line, with no list label of their own.
function matterjsWritePath(fields: AttributePathSpec): RegExp {
    return new RegExp(`InteractionServer Write «.*?${MATTERJS_PATH_START}${matterjsPath(fields)}${MATTERJS_PATH_END}`);
}

// The subscribe line that names paths is the DEBUG "request details" one; the INFO line above it
// carries path counts only. Its attribute list is bounded by the data-version filters that may follow
// it as well as by the event paths.
function matterjsSubscribePath(fields: AttributePathSpec): RegExp {
    return new RegExp(
        `InteractionServer Subscribe request details «.*attributes: (?:(?! (?:dataVersionFilters|events):).)*?${MATTERJS_PATH_START}${matterjsPath(fields)}${MATTERJS_PATH_END}`,
    );
}

/**
 * As {@link matterjsPath}, for an event path: its last segment sits under `events` where an
 * attribute's sits under `state`.
 */
function matterjsEventPath(fields: EventPathSpec): string {
    const resolvable = fields.endpoint !== undefined && fields.cluster !== undefined;
    const cluster = fields.cluster === undefined ? undefined : Matter.clusters(fields.cluster);

    const elements = [
        fields.endpoint === undefined ? "\\*" : `${fields.endpoint}`,
        matterjsElement(resolvable ? cluster?.name : undefined, fields.cluster),
    ];
    if (fields.event === undefined) {
        elements.push("\\*");
    } else {
        const event = resolvable ? cluster?.events(fields.event) : undefined;
        elements.push("events", matterjsElement(event?.name, fields.event));
    }

    return elements.join("\\.");
}

/**
 * matter.js's log of a read the TH received, naming `fields` among the event paths it asked for, and
 * carrying every flag in `flags` — which are printed before the paths, and only when set.
 *
 * The flags belong on the same pattern because they are on the same line: a separate search starting
 * past this one's match would be looking at the next read, not at this one's flags.
 */
export function matterjsReadEventPath(fields: EventPathSpec, flags: string[] = []): RegExp {
    const set = flags.map(flag => `${flag} `).join("");
    return new RegExp(
        `InteractionServer Read «.*${set}.*events: (?:(?! eventFilters:).)*?${MATTERJS_PATH_START}${matterjsEventPath(fields)}${MATTERJS_PATH_END}`,
    );
}

/** As {@link matterjsReadEventPath}, for the subscribe line that names paths. */
export function matterjsSubscribeEventPath(fields: EventPathSpec): RegExp {
    return new RegExp(
        `InteractionServer Subscribe request details «.*events: (?:(?! eventFilters:).)*?${MATTERJS_PATH_START}${matterjsEventPath(fields)}${MATTERJS_PATH_END}`,
    );
}

/** matter.js's line for the flags a subscribe request carried; only those actually set are printed. */
export function matterjsSubscribeFlags(...flags: string[]): RegExp {
    return new RegExp(`InteractionServer Subscribe «.*${flags.map(flag => `${flag} `).join(".*")}`);
}

/**
 * matter.js's line for the subscription it accepted, naming the interval bounds it took from the
 * request — a caller-supplied ceiling reaches the wire unchanged, so these are the requested values.
 */
export function matterjsSubscribeTiming(minIntervalSeconds: number, maxIntervalSeconds: number): RegExp {
    const bounds = [minIntervalSeconds, maxIntervalSeconds]
        .map(seconds => Duration.format(Seconds(seconds)).replace(/\./g, "\\."))
        .join(" - ");
    return new RegExp(`InteractionServer Subscribe successful ».*timing: ${bounds} `);
}

/**
 * Where a check whose claim matter.js prints on a line an earlier check already matched must start
 * searching. chip prints one message as a block of lines, so a further claim about that same message
 * lies after the earlier match; matter.js prints the whole message on one line, so a search starting
 * past that line would be reading the next message instead.
 *
 * On matterjs this hands back the step's own mark, which binds the two searches to the same message
 * only as long as the step drove one interaction of that kind. A step driving two would need its
 * checks correlated by the exchange each names instead.
 */
export function sameMessageFrom(flavor: string, earlier: CheckRecord, mark: number): number {
    if (!flavor.startsWith("chip")) {
        return mark;
    }
    return earlier.logLine === undefined ? mark : earlier.logLine + 1;
}

/**
 * matter.js's line for a command an invoke carried, rendered like an attribute path but ending in the
 * command itself — a command path has no `state.` segment (`resolvePathForNode`).
 */
function matterjsInvokePath(endpoint: number, cluster: number, command: number): RegExp {
    return new RegExp(`InteractionServer Invoke «.*invokes: .*?${matterjsCommandPath(endpoint, cluster, command)}`);
}

/**
 * The command path itself, bounded so it cannot match as part of a longer path, for a caller building
 * its own line around it.
 */
export function matterjsCommandPath(endpoint: number, cluster: number, command: number): string {
    const model = Matter.clusters(cluster);
    const path = [
        `${endpoint}`,
        matterjsElement(model?.name, cluster),
        matterjsElement(model?.commands(command)?.name, command),
    ].join("\\.");
    return `${MATTERJS_PATH_START}${path}${MATTERJS_PATH_END}`;
}

/**
 * One field value as matter.js writes it into that line. A string is written bare and the next field
 * follows a space, so a string is bounded by what can follow it — the line's end, or the next field's
 * `<name>:` — rather than by "not more non-space", which a value containing a space would satisfy
 * mid-value. A value matter.js cannot write on one line, or writes indistinguishably from an absent
 * one, has no pattern at all and is refused here rather than waiting for a line that cannot come.
 */
function matterjsFieldValue(value: number | bigint | string): string {
    if (typeof value !== "string") {
        return `${value}(?!\\d)`;
    }
    if (value === "" || /[\n\r]/.test(value)) {
        throw new InternalError(`matter.js does not print "${value}" as a matchable field value`);
    }
    return `${literally(value)}(?=$|\\s\\w+:)`;
}

/**
 * matter.js's line for the invoked command's own payload, which names each field rather than
 * numbering it: `<name>: <value>`, in payload order, on the line that names the command.
 */
function matterjsCommandFields(cluster: number, command: number, fields: CommandFieldValue[]): RegExp {
    const model = Matter.clusters(cluster)?.commands(command);
    const named = fields.map(({ id, value }) => {
        const name = model?.fields(id)?.name;
        if (name === undefined) {
            throw new InternalError(`Command 0x${command.toString(16)} has no field 0x${id.toString(16)}`);
        }
        return `${camelize(name)}: ${matterjsFieldValue(value)}`;
    });
    return new RegExp(`ProtocolService Invoke «.*${matterjsElement(model?.name, command)}\\b.*${named.join(".*")}`);
}

/**
 * The kind of path-carrying request {@link expectMessageWithPath} looks for. Each names a different
 * log line in either implementation, and the two implementations disagree on how much of it is one
 * line — hence a discriminator rather than a caller-supplied pattern.
 */
export type PathInteraction = "write" | "subscribe";

const PATH_INTERACTIONS = {
    write: { chip: WRITE_REQUEST_MESSAGE, matterjs: matterjsWritePath },
    subscribe: { chip: SUBSCRIBE_REQUEST_MESSAGE, matterjs: matterjsSubscribePath },
} satisfies Record<PathInteraction, { chip: RegExp; matterjs: (fields: AttributePathSpec) => RegExp }>;

/**
 * Confirms the TH's log says it received a read for exactly the path `fields` describes, at or after
 * `from`.
 *
 * chip prints the request's decoded `AttributePathIB` as a block of lines, one per present field, so
 * the check walks the whole block (see {@link expectAdjacentLines}) rather than testing a single "does
 * X appear" pattern — a wildcard sequence is a strict prefix of a concrete one, so a block with extra
 * field lines is a different block, not a match. matter.js names every path of the read on one line
 * instead (see {@link matterjsReadPath}).
 *
 * A timeout or a source closing mid-wait is recorded `"fail"` rather than propagating: a caller that
 * records the result is the only thing putting this check in the evidence bundle at all.
 */
export async function expectAttributePathIB(
    log: LogFollower,
    flavor: string,
    fields: AttributePathSpec,
    from: number,
    timeout: Duration,
): Promise<CheckRecord> {
    const pattern = `AttributePathIB ${JSON.stringify(fields)}`;
    try {
        const result = await expectAdjacentLines(
            log,
            flavor,
            { chip: attributePathIBSequence(fields), matterjs: [matterjsReadPath(fields)] },
            from,
            timeout,
        );
        if (result.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        return {
            type: "device-log",
            verdict: "pass",
            pattern,
            matched: result.last.text,
            logLine: result.last.index,
        };
    } catch (e) {
        if (e instanceof CertLogTimeoutError || e instanceof CertLogClosedError) {
            return { type: "device-log", verdict: "fail", pattern, detail: e.message, logLine: from };
        }
        throw e;
    }
}

/**
 * Confirms the TH's log says an `interaction` request carrying the path `fields` describes arrived at
 * or after `from`.
 *
 * Against chip this takes two waits: the request-message name first, then the `AttributePathIB` block
 * for `fields` at or after it (see {@link expectAttributePathIB}) — anchoring on the message name,
 * not the path block alone, rules out a differently-typed request landing at the same log position.
 * Both waits share `timeout`'s deadline. Against matter.js the request and its paths are one line.
 * Either way a timeout or a closed source is recorded as a `"fail"` rather than propagating uncaught.
 */
export async function expectMessageWithPath(
    log: LogFollower,
    flavor: string,
    interaction: PathInteraction,
    fields: AttributePathSpec,
    from: number,
    timeout: Duration,
): Promise<CheckRecord> {
    const { chip: message, matterjs } = PATH_INTERACTIONS[interaction];
    if (!flavor.startsWith("chip")) {
        return (await expectDeviceLog(log, flavor, { matterjs: matterjs(fields) }, from, timeout)).check;
    }

    const deadline = Time.nowUs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowUs));

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

    return expectAttributePathIB(log, flavor, fields, anchor.matched.index + 1, remaining());
}

/** Throws if `id` is `undefined` — narrows a model element's optional numeric id for `.toString(16)`. */
export function requireId(id: number | undefined, what: string): number {
    if (id === undefined) {
        throw new InternalError(`${what} has no numeric id`);
    }
    return id;
}

/**
 * The status a command's response carries in its own payload, or `undefined` where the answer has
 * none. A cluster that answers with a status reports a refusal there rather than as an interaction
 * status, so an invoke that resolves has told the caller nothing about it yet.
 */
export function responseStatusOf(response: unknown): number | undefined {
    if (typeof response !== "object" || response === null || !("status" in response)) {
        return undefined;
    }
    const { status } = response;
    return typeof status === "number" ? status : undefined;
}

/** Whether `commandName`'s response schema makes a status part of the answer. */
export function answersWithStatus(cluster: ClusterModel, commandName: string): boolean {
    const response = cluster.commands.require(commandName).responseModel;
    return response !== undefined && [...response.members].some(member => member.name === "Status");
}

/**
 * One `CommandFields` entry: a field id and its value. chip prints the TLV type after the value, so a
 * string is matched as `0x<id> = "<value>" (<n> chars),` — where `n` counts the string's UTF-8 bytes,
 * not its code points — and a number as `0x<id> = <value> (unsigned),`. Every numeric field any TC
 * checks so far is unsigned; chip prints a signed one as `(signed)`, which no shape here matches.
 */
export interface CommandFieldValue {
    id: number;
    value: number | bigint | string;
}

/**
 * `value` as evidence text. `JSON.stringify` throws on a `bigint`, and Matter carries plenty of them
 * (an `epoch-us`, a node id, a `systime-ms`), so a step reporting what a device answered would
 * otherwise fail on its own evidence.
 */
export function describeValue(value: unknown): string {
    return JSON.stringify(value, (_key, member) => (typeof member === "bigint" ? `${member}` : member)) ?? "undefined";
}

/** `value` as a pattern matching itself and nothing else. */
export function literally(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The line chip prints for one decoded `CommandFields` entry.
 *
 * The trailing type name is load-bearing: without it `0x0 = 2,` also matches the first two digits of
 * `0x0 = 20,`.
 */
function chipCommandField({ id, value }: CommandFieldValue): RegExp {
    const rendered =
        typeof value === "string"
            ? `"${literally(value)}" \\(${new TextEncoder().encode(value).length} chars\\)`
            : `${value} \\(unsigned\\)`;
    return new RegExp(`0x${id.toString(16)} = ${rendered},\\s*$`);
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
 * As {@link expectCommandInvoke} against a matter.js TH, which names every command one invoke carried
 * on a single line, and the invoked command's own field values on the line that reports the command
 * it dispatched.
 */
async function matterjsCommandInvoke(
    log: LogFollower,
    flavor: string,
    endpoint: number,
    cluster: number,
    command: number,
    fields: CommandFieldValue[],
    from: number,
    timeout: Duration,
): Promise<CheckRecord> {
    const deadline = Time.nowUs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowUs));

    const invoke = await expectDeviceLog(
        log,
        flavor,
        { matterjs: matterjsInvokePath(endpoint, cluster, command) },
        from,
        remaining(),
    );
    if (fields.length === 0 || invoke.check.verdict !== "pass") {
        return invoke.check;
    }

    return (
        await expectDeviceLog(
            log,
            flavor,
            { matterjs: matterjsCommandFields(cluster, command, fields) },
            invoke.from,
            remaining(),
        )
    ).check;
}

/**
 * Confirms chip's `InvokeRequestMessage` log carries a `CommandPathIB` matching `endpoint`/`cluster`/
 * `command` as a consecutive block at or after `from` (see {@link expectAdjacentLines}), then that
 * every `fields` entry appears afterward, in order, as its own line inside `CommandFields` (see
 * {@link chipCommandField}). Field lines aren't required adjacent to the `CommandPathIB` block itself — chip
 * emits a blank `CHIP:DMG:` separator line in between that isn't part of what this check verifies. A
 * search always starts at or after the previous match's own index (`log.expect`'s `from`), so this
 * can't match a field line belonging to an earlier invoke. matter.js names every command one invoke
 * carried on one line, and its field values on the line reporting the command it dispatched, so
 * against a matter.js TH this is two waits rather than one per field (see
 * {@link matterjsCommandInvoke}).
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
    if (!flavor.startsWith("chip")) {
        return matterjsCommandInvoke(log, flavor, endpoint, cluster, command, fields, from, timeout);
    }

    let cursor = from;
    let last: { index: number; text: string } | undefined;

    // One deadline for the whole check, not one per wait: a per-wait budget makes the worst case
    // timeout × (1 + fields.length), where the caller asked for timeout
    const deadline = Time.nowUs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowUs));

    try {
        const block = await expectAdjacentLines(
            log,
            flavor,
            { chip: commandPathIBSequence(endpoint, cluster, command) },
            from,
            remaining(),
        );
        if (block.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }
        last = block.last;
        cursor = block.last.index + 1;

        for (const field of fields) {
            const result = await log.expect(
                { chip: chipCommandField(field) },
                { flavor, timeoutMs: remaining(), from: cursor },
            );
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

/** How one implementation's log names the exchange a message used. */
interface ExchangeSource {
    /** The exchange the message used, or `undefined` where the log does not say. */
    exchangeOf(log: LogFollower, line: LogLine): string | undefined;

    /** What the evidence names as the pattern when the exchange cannot be read. */
    attribution: string;

    /** How the evidence says the exchange could not be read. */
    unattributed: string;
}

/**
 * What {@link expectChunkedTransfer} needs one implementation's log to tell it: which exchange the
 * DUT's read request arrived on, which lines are outbound report chunks and which exchange each went
 * out on, and which line is the DUT's ack of a chunk on that exchange.
 */
interface ChunkedTransferDialect {
    /** The DUT's read request, read off the line the step's own path check matched. */
    request: ExchangeSource;

    /** An outbound report chunk. */
    chunk: ExchangeSource & { line: RegExp };

    /**
     * Whether `chunk` is the transfer's own last message — `"unknown"` where the log stops before
     * saying. A read's last report sets `SuppressResponse` and every earlier one
     * `MoreChunkedMessages` (Matter Core § 8.4.3.3, § 10.7.3), so this is what tells the end of a
     * transfer from a log that was cut inside one.
     */
    finality(log: LogFollower, chunk: LogLine): "final" | "more" | "unknown";

    /** The DUT's ack of a chunk sent on `exchange`. */
    ack(exchange: string): RegExp;
}

/**
 * Confirms a chunked read actually chunked and that the DUT acked every chunk but the last, and only
 * those: at least two report chunks on the exchange the read's own request arrived on, with a
 * `StatusResponse` received between every adjacent pair and none after the transfer's final message.
 * Missing evidence comes back as a `"fail"` record rather than a thrown timeout, so the step's own
 * reporting carries it.
 *
 * `request` is the check that already matched this read's own request on the TH log — the paths it
 * asked for identify it, which is what keeps a second read reaching the TH in the same window from
 * standing in for it. A request the caller could not settle leaves this unverified rather than
 * anchored on something else.
 *
 * A log that ends inside the transfer carries the first claim but not the second, and says so. A
 * transfer that simply stops — the last chunk announcing more to come and nothing following — is a
 * failure, and is told from the truncated log by which of the two ended the wait.
 *
 * A read only. A subscription's reports are answered including the last, so pointing this at one would
 * fail a conforming device.
 *
 * What this cannot tell apart: exchange ids are allocated per initiator and neither implementation
 * logs the initiator, so a TH-initiated exchange whose id collides with this read's would be read as
 * part of the transfer.
 */
export async function expectChunkedTransfer(
    log: LogFollower,
    flavor: string,
    request: CheckRecord,
    timeout: Duration,
): Promise<CheckRecord> {
    const dialect = forFlavor(CHUNKED_TRANSFER_DIALECTS, flavor);
    const requestLine =
        dialect === undefined || request.verdict !== "pass" || request.logLine === undefined
            ? undefined
            : log.lines[request.logLine];
    if (dialect === undefined || requestLine === undefined) {
        return { type: "device-log", verdict: "unverified" };
    }

    const exchange = dialect.request.exchangeOf(log, requestLine);
    if (exchange === undefined) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern: dialect.request.attribution,
            detail: `${dialect.request.unattributed} for the read request at log line ${requestLine.index}`,
            logLine: requestLine.index,
        };
    }

    const deadline = Time.nowUs + timeout;

    const chunks = new Array<LogLine>();
    const skipped = new Map<string, number>();
    let cursor = requestLine.index + 1;
    let quietUntilAt: number | undefined;
    let stopped: "window" | "budget" | "source-closed" = "window";
    for (;;) {
        // Draining what has arrived and waiting for more are separate steps. A line already in the log
        // belongs to the transfer whatever the clock says now, and only the waiting is bounded; asking
        // one call to do both is what lets a backlog of another exchange's reports either carry
        // collection past the window or swallow a chunk that arrived inside it.
        let next = log.firstMatchFrom(dialect.chunk.line, cursor);

        if (next === undefined) {
            // The window closes at a wall-clock instant, because that is the clock the lines' arrival
            // stamps carry, while the budget is elapsed time. Each is read in its own clock and only
            // the remaining durations meet.
            const untilBudgetSpent = deadline - Time.nowUs;
            const untilWindowCloses = quietUntilAt === undefined ? untilBudgetSpent : quietUntilAt - Time.nowMs;
            if (untilBudgetSpent <= 0) {
                stopped = "budget";
                break;
            }
            if (untilWindowCloses <= 0) {
                break;
            }

            try {
                next = await log.expectPattern(dialect.chunk.line, {
                    timeoutMs: Millis(Math.min(untilBudgetSpent, untilWindowCloses)),
                    from: cursor,
                });
            } catch (e) {
                if (e instanceof CertLogClosedError) {
                    stopped = "source-closed";
                    break;
                }
                if (e instanceof CertLogTimeoutError) {
                    stopped = untilWindowCloses <= untilBudgetSpent ? "window" : "budget";
                    break;
                }
                throw e;
            }
        }
        cursor = next.index + 1;

        // The second chunk is what proves the read chunked at all, so the window opens only once one
        // has arrived; a chunk arriving after it closed is not this transfer's, however early the loop
        // reached it.
        if (quietUntilAt !== undefined && next.at.getTime() > quietUntilAt) {
            break;
        }

        const chunkExchange = dialect.chunk.exchangeOf(log, next);
        if (chunkExchange === undefined) {
            return {
                type: "device-log",
                verdict: "fail",
                pattern: dialect.chunk.attribution,
                detail: `${dialect.chunk.unattributed} for the report chunk at log line ${next.index}`,
                logLine: next.index,
            };
        }
        if (chunkExchange !== exchange) {
            skipped.set(chunkExchange, (skipped.get(chunkExchange) ?? 0) + 1);
            continue;
        }

        chunks.push(next);
        if (chunks.length > 1) {
            quietUntilAt = next.at.getTime() + CHUNK_QUIET;
        }
    }

    // Every failure below names what was left out: a verdict of "no chunks on this exchange" is
    // unreadable in the evidence without the reports that were there instead.
    const alsoSeen = skipped.size
        ? `; ${[...skipped].map(([id, count]) => `${count} on Exchange ${id}`).join(", ")} belonged elsewhere`
        : "";

    if (chunks.length < 2) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern: String(dialect.chunk.line),
            detail:
                `${chunks.length} report chunk${chunks.length === 1 ? "" : "s"} on Exchange ${exchange} — the read ` +
                `did not chunk${alsoSeen}`,
            logLine: chunks[0]?.index ?? requestLine.index,
        };
    }

    const ackPattern = dialect.ack(exchange);
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

    // A read's report carries SuppressResponse (Matter Core § 8.4.3.3), which the wire encoding
    // overrides to false only while MoreChunkedMessages is set (§ 10.7.3) — so the transfer's own last
    // message is the one chunk the requester must not answer.
    const last = chunks[chunks.length - 1];
    const finality = dialect.finality(log, last);
    if (finality !== "final") {
        // Which of the three reasons collection ended decides who the record names. Only silence on the
        // read's own exchange is the TH's; a source that ended and a budget that ran out are the run's,
        // and reporting either as the TH abandoning its transfer blames the wrong side.
        const unfinished =
            `${chunks.length} report chunks on Exchange ${exchange}, and the last of them ` +
            (finality === "more"
                ? "announces a further chunk"
                : "carries neither MoreChunkedMessages nor SuppressResponse");

        switch (stopped) {
            case "window":
                return {
                    type: "device-log",
                    verdict: "fail",
                    pattern: "a report chunk carrying SuppressResponse",
                    detail: `${unfinished}, and none followed within ${Duration.format(CHUNK_QUIET)}${alsoSeen}`,
                    matched: last.text,
                    logLine: last.index,
                };

            case "budget":
                return {
                    type: "device-log",
                    verdict: "unverified",
                    pattern: "a report chunk carrying SuppressResponse",
                    detail:
                        `${unfinished}; this check's own budget of ${Duration.format(timeout)} was spent before ` +
                        `the transfer ended, so whether the TH finished it is not claimed${alsoSeen}`,
                    matched: last.text,
                    logLine: last.index,
                };

            case "source-closed":
                return {
                    type: "device-log",
                    verdict: "unverified",
                    pattern: "a report chunk carrying SuppressResponse",
                    detail:
                        `${unfinished}, and the log ends there; the acks between the chunks seen are in it, but ` +
                        "whether the DUT answered this one — which is not the transfer's last — and whether it " +
                        "left the transfer's own last message unanswered are both outside the evidence",
                    matched: last.text,
                    logLine: last.index,
                };
        }
    }

    const lateAck = lines.slice(last.index + 1).find(line => !line.synthetic && ackPattern.test(line.text));
    if (lateAck !== undefined) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern: String(ackPattern),
            detail:
                `The DUT sent a StatusResponse on Exchange ${exchange} after the final one of ${chunks.length} ` +
                `report chunks (log line ${lateAck.index}), which a read's last chunk suppresses`,
            logLine: lateAck.index,
        };
    }

    // "None after the last" is a claim about a whole window, so it takes having watched that window
    // out: only collection ending at the window's own close means it was. An ack that did appear is
    // evidence whenever it appeared, which is why it is answered above this.
    if (stopped !== "window") {
        return {
            type: "device-log",
            verdict: "unverified",
            pattern: String(ackPattern),
            detail:
                `${chunks.length} report chunks, each but the last followed by a StatusResponse and the last of ` +
                `them ending the transfer; ${
                    stopped === "budget"
                        ? `this check's own budget of ${Duration.format(timeout)} was spent`
                        : "the log ended"
                } before the ${Duration.format(CHUNK_QUIET)} after it had passed, so whether the DUT went on to ` +
                "answer it is not claimed",
            matched: last.text,
            logLine: last.index,
        };
    }

    return {
        type: "device-log",
        verdict: "pass",
        pattern:
            "ReportDataMessage, StatusResponse on the same Exchange between every adjacent pair and none after the last",
        detail: `${chunks.length} report chunks, each but the last followed by a StatusResponse, and none after the last`,
        matched: last.text,
        logLine: last.index,
    };
}

/**
 * What reading a subscription id off a TH's log produced, as three outcomes rather than one optional
 * field. Every caller gates on `check` before using the result, so a failed lookup already fails the
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
        const result = await expectAdjacentLines(log, flavor, { chip: sequence }, from, timeout);
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

// Every message of an exchange carries its id, which is how a responder's messages are matched to the
// request that caused them (Matter Core, "Message Exchanges"). A subscription's reports are a different
// exchange either way — the SubscribeRequest's on a chip TH, a freshly initiated one per report round
// on a matter.js TH — but the id is all the log prints, so a collision is possible and unnoticeable.
const READ_REQUEST_RECEIVED_LINE =
    /\[DMG\] << from UDP:.*\/ Read Request \(0x02\) \/ Session = \d+ \/ Exchange = (\d+)\]\s*$/;

/**
 * chip prints the *peer's* session id on a message it sends and its own on one it receives — a real
 * capture has one interaction's outbound Report Data on `Session = 56179` and the inbound ack for it
 * on `Session = 13606` — so an ack cannot be matched to the report it answers by session, only by
 * exchange. Session scoping applies between two messages travelling the same way, which is what the
 * timed-interaction checks compare (`tc-idm-5.1-support.ts`).
 */
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
function exchangeIdBefore(log: LogFollower, trace: RegExp, beforeIndex: number): string | undefined {
    return log.lastMatchBefore(trace, beforeIndex, EXCHANGE_LOOKBACK_LINES)?.match[1];
}

// matter.js names the exchange on the report line itself, so a chunk carries its own attribution;
// chip's decode dump does not, and its exchange comes off the trace line preceding it.
const MATTERJS_REPORT_CHUNK = /Message » for: I\/ReportData .*⇵([0-9a-f]+)✉/;

// matter.js names the exchange on the read line itself; the bound stops the match from running past
// this line's own session into a later message's id.
const MATTERJS_READ_EXCHANGE = /InteractionServer Read « [^⇵]*⇵([0-9a-f]+)/;

// Both implementations say on which message a transfer ends, in their own place: matter.js renders the
// report's own flags on the report line, chip prints them inside that message's decode dump.
const MATTERJS_MORE_CHUNKS = /Message » for: I\/ReportData [^⇵]*\bmoreChunkedMessages\b/;
const MATTERJS_SUPPRESSED_RESPONSE = /Message » for: I\/ReportData [^⇵]*\bsuppressResponse\b/;
const CHIP_MORE_CHUNKS = /\[DMG\]\s+MoreChunkedMessages = true,\s*$/;

// chip logs one message at a time, each dump preceded by its own trace line, whichever direction it
// went — the same invariant `exchangeIdBefore` reads backward.
const CHIP_MESSAGE_TRACE_LINE = /\[DMG\] (?:>> to|<< from) UDP:/;
const CHIP_SUPPRESSED_RESPONSE = /\[DMG\]\s+SuppressResponse = true,\s*$/;

/**
 * Which of the two flags chip printed first at or after `chunk`. They are fields of the message's own
 * decode dump, so the first of either after the chunk line belongs to that chunk; a log cut inside the
 * dump has neither.
 */
function chipChunkFinality(log: LogFollower, chunk: LogLine): "final" | "more" | "unknown" {
    for (let i = chunk.index + 1; ; i++) {
        const line = log.at(i);
        if (line === undefined) {
            break;
        }
        if (line.synthetic) {
            continue;
        }
        // A message's decode dump ends where the next message's trace line begins, so a flag past that
        // line is another report's and says nothing about this one. Without the bound, a report skipped
        // for belonging to another exchange can still mark this chunk final.
        if (CHIP_MESSAGE_TRACE_LINE.test(line.text)) {
            break;
        }
        if (CHIP_SUPPRESSED_RESPONSE.test(line.text)) {
            return "final";
        }
        if (CHIP_MORE_CHUNKS.test(line.text)) {
            return "more";
        }
    }
    return "unknown";
}

const CHUNKED_TRANSFER_DIALECTS: { chip: ChunkedTransferDialect; matterjs: ChunkedTransferDialect } = {
    chip: {
        request: {
            exchangeOf: (log, line) => exchangeIdBefore(log, READ_REQUEST_RECEIVED_LINE, line.index),
            attribution: String(READ_REQUEST_RECEIVED_LINE),
            unattributed: "No inbound Read Request trace line (carrying an Exchange id) found",
        },
        chunk: {
            line: REPORT_DATA_MESSAGE,
            exchangeOf: (log, line) => exchangeIdBefore(log, REPORT_SENT_LINE, line.index),
            attribution: String(REPORT_SENT_LINE),
            unattributed: "No outbound Report Data trace line (carrying an Exchange id) found",
        },
        finality: (log, chunk) => chipChunkFinality(log, chunk),
        ack: reportAckedOnExchange,
    },

    matterjs: {
        request: {
            exchangeOf: (_log, line) => MATTERJS_READ_EXCHANGE.exec(line.text)?.[1],
            attribution: String(MATTERJS_READ_EXCHANGE),
            unattributed: "No exchange id on the read line",
        },
        chunk: {
            line: MATTERJS_REPORT_CHUNK,
            exchangeOf: (_log, line) => MATTERJS_REPORT_CHUNK.exec(line.text)?.[1],
            attribution: String(MATTERJS_REPORT_CHUNK),
            unattributed: "No exchange id on the report line",
        },
        finality: (_log, chunk) =>
            MATTERJS_SUPPRESSED_RESPONSE.test(chunk.text)
                ? "final"
                : MATTERJS_MORE_CHUNKS.test(chunk.text)
                  ? "more"
                  : "unknown",
        ack: exchange => new RegExp(`Message « for: I/StatusResponse .*⇵${exchange}✉`),
    },
};

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
    carriesData: boolean,
): Promise<CheckRecord> {
    const deadline = Time.nowUs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowUs));
    const reportPattern = matterjsReportPattern(subscriptionId, carriesData);
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
 *
 * A report carrying no data is not accepted by default, because it is acked exactly like a report and so
 * could stand in for one the step asked for — that is the keepalive an idle subscription sends. Pass
 * `{ carriesData: false }` where a report carrying nothing is itself a legitimate answer: the priming
 * report of a subscription established with nothing to report yet, which is ordinary for events.
 */
export async function expectReportAck(
    log: LogFollower,
    flavor: string,
    subscription: SubscriptionIdLookup,
    from: number,
    timeout: Duration,
    options: { carriesData?: boolean } = {},
): Promise<CheckRecord> {
    // Takes the lookup rather than its id so a failure cannot arrive here as an unverified nobody can
    // explain. Callers gate on `check` first, so this is the second line of defence, not the first.
    if (subscription.outcome !== "found") {
        return subscription.check;
    }
    const { subscriptionId } = subscription;
    const { carriesData = true } = options;

    if (flavor === "matterjs") {
        return matterjsReportAck(log, flavor, subscriptionId, from, timeout, carriesData);
    }

    const deadline = Time.nowUs + timeout;
    const remaining = () => Millis(Math.max(1, deadline - Time.nowUs));
    const pattern = `ReportDataMessage(SubscriptionId = 0x${subscriptionId.toString(16)})${carriesData ? " carrying data" : ""} then its own ${STATUS_RESPONSE_SUCCESS} (matched by Exchange id)`;

    try {
        const report = await expectAdjacentLines(
            log,
            flavor,
            {
                chip: carriesData
                    ? [REPORT_DATA_MESSAGE, /\{\s*$/, subscriptionIdPattern(subscriptionId), REPORT_DATA_IBS]
                    : [REPORT_DATA_MESSAGE, /\{\s*$/, subscriptionIdPattern(subscriptionId)],
            },
            from,
            remaining(),
        );
        if (report.verdict === "unverified") {
            return { type: "device-log", verdict: "unverified" };
        }

        const exchange = exchangeIdBefore(log, REPORT_SENT_LINE, report.last.index);
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
