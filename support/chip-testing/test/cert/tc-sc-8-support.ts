/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, MAX_UDP_MESSAGE_SIZE, Millis, Seconds, Time } from "@matter/general";
import { Matter } from "@matter/model";
import { MATTER_MESSAGE_OVERHEAD } from "@matter/protocol";
import type { CertNodeRef, CertSessionInfo, CertStepContext, CheckRecord, DeviceFlavor } from "@matter/testing";
import { resolveControllerImplementation, UnsupportedByControllerError } from "@matter/testing";
import {
    CertCheckFailedError,
    CommissionedRefs,
    describeError,
    describeValue,
    expectSequence,
    literally,
    LOG_TIMEOUT,
    matterjsCommandPath,
    record,
    recordAll,
    requireId,
} from "./tc-support.js";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const VENDOR_NAME_ID = requireId(BASIC_INFORMATION.attributes.require("vendorName").id, "BasicInformation.vendorName");

/**
 * The TCP cases invert this suite's usual topology: the **DUT is the device** (a TCP server) and the
 * **TH is the controller** (a TCP client), so a step drives `cx.controllers.th` and reads
 * `cx.devices.dut`'s log.
 *
 * Only a device that advertises TCP gets a TCP-backed session — matter.js's controller requires the
 * peer's `SUPPORTED_TRANSPORTS.tcpServer` before it will use one. chip's all-clusters app as built
 * here does not advertise it, and a run against it silently uses UDP instead, which would leave these
 * cases claiming a transport nobody used.
 */
export const TCP_FLAVORS: DeviceFlavor[] = ["matterjs"];

export const TCP_PICS = ["MCORE.SC.TCP"];

/** Role wiring for a TCP case, named for the roles the plan gives them rather than this suite's usual pair. */
export const TCP_ROLES = {
    controllers: { th: "helper" },
    devices: { dut: "all-clusters" },
} as const;

/**
 * Commissions the DUT and then uses the session, which is what the plan's "initiates a CASE session
 * establishment ... requesting a session supporting large payloads" amounts to here: matter.js
 * prefers TCP for every session once asked, so commissioning establishes the session this case is
 * about and the read exercises it. Only matter.js reaches this point — see
 * {@link requireTcpCapableController}.
 */
export async function commissionOverTcp(cx: CertStepContext, commissioned: CommissionedRefs<"th">) {
    requireTcpCapableController();

    const dut = cx.devices.dut;
    const from = dut.log.mark();

    const th = cx.controllers.th;
    const ref = await th.commission({
        passcode: dut.commissioning.passcode,
        discriminator: dut.commissioning.discriminator,
    });
    commissioned.set("th", ref);

    // `largeMessage` makes the transport a hard requirement rather than a preference, so a controller
    // that fell back to MRP fails the read instead of leaving the case claiming a transport it never used
    await th
        .node(ref)
        .readAttribute(
            { endpoint: 0, cluster: BASIC_INFORMATION_ID, attribute: VENDOR_NAME_ID },
            { largeMessage: true },
        );

    return { ref, from };
}

/**
 * chip-tool decides a session's transport when it establishes one, and it keeps using the session
 * pairing already made — so `--allow-large-payload` on a later interaction reaches the DUT over that
 * existing UDP session and no TCP connection is ever set up. The refusal comes before the step acts,
 * so the case is recorded as skipped rather than failing on evidence the controller could not produce.
 */
export function requireTcpCapableController() {
    const implementation = resolveControllerImplementation();
    if (implementation !== "matterjs") {
        throw new UnsupportedByControllerError(
            "a session established over TCP",
            implementation,
            "chip-tool reuses the session commissioning established, so a large-payload interaction " +
                "does not cause it to establish a TCP-backed one",
        );
    }
}

/**
 * Confirms the DUT's own log shows the CASE session it just accepted running over TCP: matter.js
 * renders a session's transport in the session tag and names the channel the peer connected on, so
 * `(tcp)` beside a `tcp://` address is the device saying the connection underneath is a TCP one.
 *
 * Returns the DUT's own tag for that session, so a later step can bind its evidence to this session
 * rather than to any session that happens to be a TCP one.
 */
export async function recordTcpSession(
    cx: CertStepContext,
    from: number,
    what: string,
): Promise<{ tag: string; channel: string }> {
    const dut = cx.devices.dut;

    const pairing = await expectSequence(
        dut.log,
        dut.flavor,
        "a pairing request over a TCP connection",
        { matterjs: [/CaseServer .*\(tcp\).*Pairing request « (tcp:\/\/\S+)/] },
        from,
        LOG_TIMEOUT,
    );
    record(cx, pairing, `${what}: the DUT accepted a TCP connection`);
    if (pairing.verdict !== "pass" || pairing.matched === undefined || pairing.logLine === undefined) {
        throw new CertCheckFailedError(`the DUT's pairing request is not on the record: ${describeValue(pairing)}`);
    }

    // The peer's own address is the only token both lines carry, and without it a second CASE
    // establishment on this device supplies the session line and the wrong session is captured
    const channel = PEER_CHANNEL.exec(pairing.matched)?.[1];
    if (channel === undefined) {
        throw failedCheck(
            cx,
            PEER_CHANNEL.source,
            `the pairing request names no channel: ${pairing.matched}`,
            pairing.logLine,
        );
    }

    const established = await expectSequence(
        dut.log,
        dut.flavor,
        `a CASE session established over the TCP connection from ${channel}`,
        { matterjs: [new RegExp(`CaseServer .*\\(tcp\\).*New session with .*address: ${literally(channel)}(?!\\S)`)] },
        pairing.logLine + 1,
        LOG_TIMEOUT,
    );
    record(cx, established, what);
    if (established.verdict !== "pass" || established.matched === undefined) {
        throw new CertCheckFailedError(`the DUT's session line is not on the record: ${describeValue(established)}`);
    }

    const tag = SESSION_TAG.exec(established.matched)?.[1];
    if (tag === undefined) {
        throw failedCheck(
            cx,
            SESSION_TAG.source,
            `the DUT's session line names no TCP session: ${established.matched}`,
            established.logLine,
        );
    }

    return { tag, channel };
}

/** Records `detail` as a failed device-log check and returns the error a caller throws. */
function failedCheck(cx: CertStepContext, pattern: string, detail: string, logLine?: number) {
    cx.recorder.check({ type: "device-log", verdict: "fail", pattern, detail, logLine });
    return new CertCheckFailedError(detail);
}

/**
 * The session part of a matter.js session tag — `@<fabric>:<node>•<id>`, which the transport marker
 * `(tcp)` follows.
 */
const SESSION_TAG = /(@[0-9a-f]+:[0-9a-f]+•[0-9a-f]+)\(tcp\)/;

/** The channel a peer connected on, as both the pairing line and the session line render it. */
const PEER_CHANNEL = /(tcp:\/\/\S+)/;

/**
 * Confirms the DUT dispatched `endpoint`/`cluster`/`command` on `session` and answered it there: the
 * request line names the command the TH sent, the dispatch line says the DUT finished it, and the
 * message line is the `InvokeResponse` going back out. Every one of them carries the session tag,
 * which is what makes this the session step 1 established rather than any TCP-backed one.
 */
export async function tcpInvokeCheck(
    cx: CertStepContext,
    session: string,
    endpoint: number,
    cluster: number,
    command: number,
    from: number,
): Promise<CheckRecord> {
    return (await tcpInvokeEvidence(cx, session, endpoint, cluster, command, from)).check;
}

/**
 * What {@link tcpInvokeCheck} observed, for a step that has more to say about the same invoke: the
 * exchange it used and the last line of it the DUT wrote, so a further check bounds itself to this
 * interaction rather than to whatever else the log holds.
 */
export interface TcpInvokeEvidence {
    check: CheckRecord;
    exchange?: string;
    lastLine?: number;
}

export async function tcpInvokeEvidence(
    cx: CertStepContext,
    session: string,
    endpoint: number,
    cluster: number,
    command: number,
    from: number,
): Promise<TcpInvokeEvidence> {
    const dut = cx.devices.dut;
    const onSession = `${literally(session)}\\(tcp\\)`;
    const path = matterjsCommandPath(endpoint, cluster, command);
    const what = `an invoke of ${endpoint}/${cluster}/${command} on ${session}`;

    const invoked = await expectSequence(
        dut.log,
        dut.flavor,
        what,
        {
            matterjs: [
                // The invoke line carries the timed/suppress-response flags between the session and
                // its path, and drops them when neither is set
                new RegExp(`InteractionServer Invoke « ${onSession}⇵[0-9a-f]+.*invokes: .*?${path}`),
            ],
        },
        from,
        LOG_TIMEOUT,
    );
    if (invoked.verdict !== "pass" || invoked.matched === undefined || invoked.logLine === undefined) {
        return { check: invoked };
    }

    // The answer has to be this invoke's own, and an exchange is what makes it so: a second invoke on
    // the same session would otherwise supply the response lines
    const exchange = EXCHANGE.exec(invoked.matched)?.[1];
    if (exchange === undefined) {
        return {
            check: {
                type: "device-log",
                verdict: "fail",
                pattern: EXCHANGE.source,
                detail: `the DUT's invoke line names no exchange: ${invoked.matched}`,
                logLine: invoked.logLine,
            },
        };
    }

    const onExchange = `${onSession}⇵${exchange}`;
    const answered = await expectSequence(
        dut.log,
        dut.flavor,
        `${what} answered with an InvokeResponse on exchange ${exchange}`,
        {
            matterjs: {
                ordered: [
                    new RegExp(`InteractionServer Invoke \\(final\\) » ${onExchange} commands: 1(?!\\d)`),
                    new RegExp(`Message » for: I/InvokeResponse .*\\bid: ${onExchange}✉`),
                ],
            },
        },
        invoked.logLine + 1,
        LOG_TIMEOUT,
    );

    return { check: answered, exchange, lastLine: answered.logLine ?? invoked.logLine };
}

/** The exchange a matter.js log line names. */
const EXCHANGE = /⇵([0-9a-f]+)/;

/** {@link tcpInvokeCheck}, recorded as the step's evidence. */
export async function recordTcpInvoke(
    cx: CertStepContext,
    session: string,
    endpoint: number,
    cluster: number,
    command: number,
    from: number,
    what: string,
) {
    record(cx, await tcpInvokeCheck(cx, session, endpoint, cluster, command, from), what);
}

/**
 * Above this, a report cannot have crossed an MRP session: 1280 bytes is the IPv6 minimum MTU, and
 * MRP's own payload budget is smaller still (~1232 bytes once the headers are counted), so a payload
 * larger than this is conservative evidence of a large-payload session either way.
 *
 * @see {@link MatterSpecification.v16.Core} § 4.4.4
 */
const LARGE_PAYLOAD_FLOOR = 1280;

/** The payload size matter.js prints on a message line — the encoded message, without its framing. */
const MESSAGE_SIZE = /\bsize: (\d+)\b/;

/** How much of a matched line the evidence keeps; a wildcard read's report line carries its whole payload in hex. */
const EVIDENCE_LIMIT = 300;

/**
 * Confirms the DUT answered the wildcard read that arrived on `session` with a **single**
 * `ReportData` too large for an MRP session to have carried — the behaviour a large-payload session
 * exists for, and the only witness of it this stack produces: nothing logs a session's maximum
 * payload, while a report that both exceeds {@link LARGE_PAYLOAD_FLOOR} and was never chunked could
 * not have crossed one.
 */
export async function wildcardReadInOneReportCheck(
    cx: CertStepContext,
    session: string,
    from: number,
): Promise<CheckRecord> {
    const dut = cx.devices.dut;
    const onSession = `${literally(session)}\\(tcp\\)`;

    const request = await expectSequence(
        dut.log,
        dut.flavor,
        `a read of every attribute on ${session}`,
        // The path is what tells this read from any other on the session — step 1 reads a single
        // attribute moments earlier
        { matterjs: [new RegExp(`InteractionServer Read « ${onSession}⇵[0-9a-f]+ .*attributes: \\*\\.\\*\\.\\*`)] },
        from,
        LOG_TIMEOUT,
    );
    if (request.verdict !== "pass" || request.matched === undefined || request.logLine === undefined) {
        return request;
    }

    const exchange = EXCHANGE.exec(request.matched)?.[1];
    if (exchange === undefined) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern: EXCHANGE.source,
            detail: `the DUT's read line names no exchange: ${request.matched}`,
            logLine: request.logLine,
        };
    }

    const report = new RegExp(`Message » for: I/ReportData .*\\bid: ${onSession}⇵${exchange}✉`);
    const first = await expectSequence(
        dut.log,
        dut.flavor,
        `a ReportData answering the read on exchange ${exchange}`,
        { matterjs: [report] },
        request.logLine + 1,
        LOG_TIMEOUT,
    );
    if (first.verdict !== "pass") {
        return first;
    }

    // Waiting for the first report is what makes the count trustworthy: a device that chunks emits
    // the rest immediately after it, and settling only bounds the pump's own lag
    await dut.log.settled();
    const lines = dut.log.lines;
    const reports = lines.slice(request.logLine + 1).filter(line => !line.synthetic && report.test(line.text));

    const sizes = reports.map(line => Number(MESSAGE_SIZE.exec(line.text)?.[1] ?? Number.NaN));
    const single = reports.length === 1 && sizes[0] > LARGE_PAYLOAD_FLOOR;
    return {
        type: "device-log",
        verdict: single ? "pass" : "fail",
        pattern: report.source,
        detail: `${reports.length} ReportData on exchange ${exchange}, of ${sizes.join(", ") || "no"} bytes`,
        matched: reports[0]?.text.slice(0, EVIDENCE_LIMIT),
        logLine: reports[0]?.index,
    };
}

/** {@link wildcardReadInOneReportCheck}, recorded as the step's evidence. */
export async function recordWildcardReadInOneReport(cx: CertStepContext, session: string, from: number, what: string) {
    record(cx, await wildcardReadInOneReportCheck(cx, session, from), what);
}

/**
 * What an MRP message may carry as payload, which is what a device's message line reports: the UDP
 * channel's own budget less the Matter header and MIC the exchange subtracts from it. Derived from
 * the constants the production path uses rather than written out, so it cannot drift from them.
 *
 * A different, tighter number than {@link LARGE_PAYLOAD_FLOOR}, and not interchangeable with it: that
 * floor is the IPv6 MTU, above which nothing MRP-sized fits, while a request has to fit *this* before
 * a case may call it one MRP could equally have carried.
 */
const MRP_PAYLOAD_LIMIT = MAX_UDP_MESSAGE_SIZE - MATTER_MESSAGE_OVERHEAD;

/**
 * Confirms the request the DUT received on `exchange` was one an MRP session could equally have
 * carried: the case this belongs to is about a *regularly sized* interaction choosing the TCP session
 * that already exists, so a payload only TCP could carry would prove the wrong thing.
 *
 * `exchange` is the one {@link tcpInvokeEvidence} matched, so the size measured belongs to the invoke
 * the step checked rather than to whatever else the session carried.
 */
export async function regularSizedRequestCheck(
    cx: CertStepContext,
    session: string,
    exchange: string,
    from: number,
): Promise<CheckRecord> {
    const dut = cx.devices.dut;
    const pattern = new RegExp(`Message « for: I/InvokeRequest .*\\bid: ${literally(session)}\\(tcp\\)⇵${exchange}✉`);
    const request = await expectSequence(
        dut.log,
        dut.flavor,
        pattern.source,
        { matterjs: [pattern] },
        from,
        LOG_TIMEOUT,
    );
    if (request.verdict !== "pass" || request.matched === undefined) {
        return request;
    }

    const size = Number(MESSAGE_SIZE.exec(request.matched)?.[1] ?? Number.NaN);
    return {
        type: "device-log",
        verdict: size > 0 && size <= MRP_PAYLOAD_LIMIT ? "pass" : "fail",
        pattern: pattern.source,
        detail: `the InvokeRequest carried ${size} bytes, against an MRP limit of ${MRP_PAYLOAD_LIMIT}`,
        matched: request.matched.slice(0, EVIDENCE_LIMIT),
        logLine: request.logLine,
    };
}

/**
 * Confirms the DUT established no further CASE session between `from` and `until`: the case this
 * belongs to claims the interaction reused the session already established, and an interaction that
 * caused a second one would satisfy every other check just as well.
 *
 * `until` is the last line of the interaction itself, so the window is the interaction's own and is
 * non-empty by construction — a scan to the end of the buffer would report a session the DUT accepted
 * afterwards, and an unanchored one could pass on a log that had not arrived yet.
 *
 * A second TCP *connection* carrying the same session is not observable here: matter.js logs no
 * accept, and a session re-attached to a new connection still renders `(tcp)`.
 */
export async function noFurtherSessionCheck(cx: CertStepContext, from: number, until: number): Promise<CheckRecord> {
    const dut = cx.devices.dut;
    if (dut.flavor !== "matterjs") {
        return { type: "device-log", verdict: "unverified" };
    }

    await dut.log.settled();
    const opened = dut.log
        .window(from, until + 1 - from)
        .filter(line => !line.synthetic && FURTHER_SESSION.test(line.text));

    return {
        type: "device-log",
        verdict: opened.length ? "fail" : "pass",
        pattern: FURTHER_SESSION.source,
        detail: `${opened.length} further session(s) established between log lines ${from} and ${until}`,
        matched: opened[0]?.text.slice(0, EVIDENCE_LIMIT),
        logLine: opened[0]?.index,
    };
}

/**
 * The `SystemTimeMs` a `TimeSnapshotResponse` carries, or undefined for an answer that is not one.
 * `GeneralDiagnostics.TimeSnapshot` is what the TCP cases invoke: it carries a response of its own,
 * which is what "a command response" means, and changes nothing on the DUT, so a rerun does not
 * depend on what the previous one left behind.
 */
export function systemTimeMsOf(response: unknown): number | bigint | undefined {
    if (typeof response !== "object" || response === null || !("systemTimeMs" in response)) {
        return undefined;
    }
    const value = response.systemTimeMs;
    return typeof value === "number" || typeof value === "bigint" ? value : undefined;
}

/** What a step records for the answer to a `TimeSnapshot` it invoked. */
export function timeSnapshotResponseCheck(response: unknown, refusal: unknown): CheckRecord {
    if (refusal !== undefined) {
        return {
            type: "response",
            verdict: "fail",
            detail: `the DUT refused TimeSnapshot: ${describeError(refusal)}`,
        };
    }

    const systemTimeMs = systemTimeMsOf(response);
    return {
        type: "response",
        verdict: systemTimeMs === undefined ? "fail" : "pass",
        detail:
            systemTimeMs === undefined
                ? `the DUT answered TimeSnapshot with ${describeValue(response)}, which carries no SystemTimeMs`
                : `TimeSnapshotResponse systemTimeMs=${systemTimeMs}`,
    };
}

/**
 * A CASE session the DUT established, over any transport. Not the pairing request that precedes it:
 * matter.js writes that before it has read Sigma1, so an attempt the DUT went on to reject would read
 * as a session it accepted.
 */
const FURTHER_SESSION = /CaseServer .*(?:New|Resumed) session with/;

/**
 * What a TCP case knows about the session its first step established, from both sides.
 *
 * The DUT's tag identifies the session in its own log; the channel is the only token its pairing and
 * its eviction lines share, so a case that severs a connection needs it to say *which* connection
 * went. The controller's session id is what tells a re-established session from the one before it —
 * the DUT's tag alone cannot, since a peer may reuse a session id it has closed.
 */
export interface TcpSessionFacts {
    tag: string;
    channel: string;
    controllerSessionId: number;
}

/** Where a TCP case keeps the session its first step established, for the steps that follow. */
export class TcpSessionRef {
    #facts?: TcpSessionFacts;

    set(facts: TcpSessionFacts) {
        this.#facts = facts;
    }

    require(): TcpSessionFacts {
        if (this.#facts === undefined) {
            throw new CertCheckFailedError("no TCP session was captured");
        }
        return this.#facts;
    }

    clear() {
        this.#facts = undefined;
    }
}

/**
 * Applies {@link requireTcpCapableController} to a step, which every step of a TCP case owes: a step
 * that skipped it refuses on the commissioning an earlier step never did instead, and reports a
 * failure where the truth is that the controller cannot establish such a session at all.
 */
export function tcpStep(run: (cx: CertStepContext) => Promise<void>) {
    return async (cx: CertStepContext) => {
        requireTcpCapableController();
        await run(cx);
    };
}

/** Every TCP case starts the same way, so its first step is shared rather than copied. */
export function tcpSessionStep(commissioned: CommissionedRefs<"th">, session: TcpSessionRef) {
    return async (cx: CertStepContext) => {
        const { ref, from } = await commissionOverTcp(cx, commissioned);
        const { tag, channel } = await recordTcpSession(
            cx,
            from,
            "the session the TH established with the DUT runs over TCP, which is what makes it large-payload-capable",
        );

        session.set({ tag, channel, controllerSessionId: tcpSessionIdOf(await heldSessions(cx, ref)) });
    };
}

/** Every live session the TH holds with `ref`. */
export function heldSessions(cx: CertStepContext, ref: TcpRef): Promise<CertSessionInfo[]> {
    return cx.controllers.th.node(ref).sessions();
}

/** The session `id` names among `sessions`, and undefined when it holds no such session. */
export function sessionWithId(sessions: CertSessionInfo[], id: number) {
    return sessions.find(session => session.id === id);
}

/**
 * The id of the one TCP session among `sessions`, which every later step names.
 *
 * Exactly one: a controller may hold a session per transport, and a case that took "the TCP session"
 * from a set holding two of them would be reasoning about whichever came back first. Two is reachable
 * — a peer-lost session lingers until it closes, and an inbound session is adopted into the same peer
 * — so this refuses rather than choosing, and the step fails.
 *
 * Takes the sessions rather than reading them, so an id and the set it was drawn from are the same
 * observation. Reading twice would let a check judge one read against an id from another.
 */
export function tcpSessionIdOf(sessions: CertSessionInfo[]): number {
    const tcp = sessions.filter(session => session.transport === "tcp");
    if (tcp.length !== 1) {
        throw new CertCheckFailedError(
            `the TH holds ${tcp.length} TCP ${tcp.length === 1 ? "session" : "sessions"} with the DUT, ` +
                `and this case is about exactly one — it holds ${describeSessions(sessions)}`,
        );
    }
    return tcp[0].id;
}

/**
 * What the TH's own account of the session `id` names says about large payloads.
 *
 * The controller is the only side that can answer this: the plan asks whether the session *permits* a
 * large payload, and a peer can only ever be observed carrying one — which is what makes this a
 * different claim from {@link recordTcpSession}'s, where the *device* says the connection underneath
 * is TCP.
 *
 * The three properties are **not independent evidence**. All three come from the session's channel,
 * and each channel type fixes them: `TcpChannel` declares `supportsLargeMessages = true` with a
 * 64000-byte ceiling, `UdpTransport` and `Ble` declare `false`. So requiring all three is a
 * consistency guard — it fails a channel that reports a combination no transport should produce —
 * rather than three separate findings. A case wanting behavioural proof that a large payload crossed
 * needs `TC-SC-8.6`.
 *
 * Named rather than newest, so a sibling session over another transport can neither satisfy this nor
 * fail it.
 */
export function largePayloadSessionCheck(sessions: CertSessionInfo[], id: number): CheckRecord {
    const held = sessionWithId(sessions, id);
    if (held === undefined) {
        return {
            type: "response",
            verdict: "fail",
            detail: `the TH holds no session ${id} with the DUT, and holds ${describeSessions(sessions)}`,
        };
    }

    const detail =
        `the TH holds ${held.transport} session ${held.id}, which ` +
        `${held.largePayload ? "permits" : "denies"} large payloads, with a maximum payload of ` +
        `${held.maxPayloadSize} bytes`;

    const passes = held.transport === "tcp" && held.largePayload && held.maxPayloadSize > LARGE_PAYLOAD_FLOOR;
    return { type: "response", verdict: passes ? "pass" : "fail", detail };
}

/**
 * How an evidence record names the sessions a controller holds.
 *
 * Ordered by id, because `sessions()` promises no order and an evidence string that varied with the
 * controller's internal iteration would differ between runs of the same case.
 */
export function describeSessions(sessions: CertSessionInfo[]) {
    return sessions.length === 0
        ? "no sessions"
        : [...sessions]
              .sort((a, b) => a.id - b.id)
              .map(session => `${session.transport} session ${session.id}`)
              .join(", ");
}

/** {@link largePayloadSessionCheck}, recorded as the step's evidence. */
export async function recordLargePayloadSession(cx: CertStepContext, ref: TcpRef, id: number, what: string) {
    record(cx, largePayloadSessionCheck(await heldSessions(cx, ref), id), what);
}

/**
 * The DUT's own account of evicting the session `severed` names when its connection dropped.
 *
 * Both lines, in order: the DUT names the connection that went, then the session it dropped with it. Either alone is
 * ambiguous — a device may reuse a session tag it has closed, and it may drop another connection of its own accord —
 * so only the pair says that *this* session went with *this* connection. Other sessions on the same connection log
 * between them, which is why the sequence is ordered rather than adjacent.
 *
 * Returns the record rather than recording it, so a caller can put it in the evidence alongside the controller's half
 * whichever of the two fails.
 */
export async function sessionEvictionCheck(
    cx: CertStepContext,
    severed: TcpSessionFacts,
    from: number,
    timeout: Duration = LOG_TIMEOUT,
): Promise<CheckRecord> {
    const dut = cx.devices.dut;
    if (dut === undefined) {
        throw new InternalError("A case that records a session eviction must declare a dut device");
    }

    return expectSequence(
        dut.log,
        dut.flavor,
        `the DUT evicting session ${severed.tag} on the connection from ${severed.channel}`,
        {
            matterjs: {
                ordered: [
                    new RegExp(`TCP connection dropped, evicting bound sessions: ${literally(severed.channel)}(?!\\S)`),
                    new RegExp(`Evicting session due to TCP disconnect: ${literally(severed.tag)}`),
                ],
            },
        },
        from,
        timeout,
    );
}

/**
 * What the TH holds once the session `severed` names is gone: anything but that session.
 *
 * Identified rather than counted, and identified rather than "the newest": a controller may hold a
 * session per transport and may reconnect on its own, so neither "it holds none" nor "the newest one
 * differs" states what the plan forbids — the *severed* session remaining usable.
 */
export function sessionGoneCheck(severed: TcpSessionFacts, sessions: CertSessionInfo[]): CheckRecord {
    const held = sessionWithId(sessions, severed.controllerSessionId);
    return {
        type: "response",
        verdict: held === undefined ? "pass" : "fail",
        detail:
            `the TH ${held === undefined ? "no longer holds" : "still holds"} session ` +
            `${severed.controllerSessionId}, and holds ${describeSessions(sessions)}`,
    };
}

/**
 * How long to wait for the controller to drop a severed session.
 *
 * Severing closes the channel; the eviction that follows runs on a worker nothing a step can await
 * (`ExchangeManager` adds it to its own multiplex), and with an exchange still open it suspends
 * before marking the session closed. So the absence has to be waited for rather than read once.
 */
const EVICTION_TIMEOUT = Seconds(5);

/** How often {@link recordSeveredSession} re-reads the controller's sessions while waiting. */
const EVICTION_POLL = Millis(50);

/**
 * Severs the connection beneath the session `session` names and records that the TH no longer holds it,
 * plus the DUT's own eviction ({@link sessionEvictionCheck}).
 *
 * `timeout` bounds each half of the wait separately — the controller's poll, then the DUT's own log line.
 */
export async function recordSeveredSession(
    cx: CertStepContext,
    ref: TcpRef,
    session: TcpSessionRef,
    timeout: Duration = EVICTION_TIMEOUT,
) {
    const severed = session.require();
    const dut = cx.devices.dut;
    if (dut === undefined) {
        throw new InternalError("A case that severs a session must declare a dut device");
    }

    // Settled, not just marked: the pump ingests asynchronously, so a line the device wrote before the sever could
    // otherwise land after the mark and be read as the eviction this step causes
    const from = await dut.log.markSettled();

    await cx.controllers.th.node(ref).severTransportConnection(severed.controllerSessionId);

    let sessions = await heldSessions(cx, ref);
    // Elapsed time, so the clock must not be one that can step
    const deadline = Time.nowUs + timeout;
    while (sessionWithId(sessions, severed.controllerSessionId) !== undefined && Time.nowUs < deadline) {
        await Time.sleep("cert severed session eviction", EVICTION_POLL);
        sessions = await heldSessions(cx, ref);
    }

    // Awaited before recording anything: recordAll throws once at the end so a step's whole claim reaches the
    // evidence, and a device check recorded after it would be missing from the bundle exactly when the step fails
    const eviction = await sessionEvictionCheck(cx, severed, from, timeout);

    recordAll(cx, [
        {
            check: () => sessionGoneCheck(severed, sessions),
            what: `the TH no longer holds session ${severed.controllerSessionId}`,
        },
        { check: () => eviction, what: `the DUT dropped session ${severed.tag}` },
    ]);
}

/**
 * Confirms a *further* CASE session over TCP, from the controller's own session ids.
 *
 * The claim is not attributable from the device's log. A controller re-establishes a session on its
 * own schedule — the cert adapter leaves sustained subscriptions on, and a lost subscription
 * reconnects by establishing one — so a check that matches a CASE-establishment line and calls it
 * this step's races either way around whatever mark it takes: a mark before the reconnect matches a
 * line the read did not cause, and a mark after it finds no line at all because the read reused the
 * session the reconnect had already made, failing a case whose outcome actually held.
 *
 * Session ids carry no such window. "A TCP session exists, it is not the one severed, and it permits
 * large payloads" is the whole of what the plan asks, and all three come from `sessions()`. The
 * device's own line for a further session is still recorded — it is worth having in the bundle — but
 * it does not gate the step, and it is searched from before the sever so a reconnect that beat the
 * read is found rather than missed.
 */
export async function recordReestablishedSession(
    cx: CertStepContext,
    ref: TcpRef,
    previous: TcpSessionFacts,
    from: number,
) {
    // A read the peer must answer over TCP: it re-establishes the session and refuses to travel over
    // MRP, so this step cannot pass on a fallback the plan does not describe
    await cx.controllers.th
        .node(ref)
        .readAttribute(
            { endpoint: 0, cluster: BASIC_INFORMATION_ID, attribute: VENDOR_NAME_ID },
            { largeMessage: true },
        );

    // One read for both the id and the checks: two would let the checks judge a set the id was never
    // drawn from
    const sessions = await heldSessions(cx, ref);
    const id = tcpSessionIdOf(sessions);
    const further = await furtherSessionCheck(cx, from);
    recordAll(cx, [
        {
            check: () => sessionGoneCheck(previous, sessions),
            what: "the session the TH holds is not the one it severed",
        },
        {
            check: () => largePayloadSessionCheck(sessions, id),
            what: "the re-established session allows large payloads",
        },
        { check: () => further, what: "the DUT accepted a further session over TCP" },
    ]);
}

/**
 * The DUT's own line for a further CASE session over TCP, as corroboration rather than as a gate.
 *
 * Unverified rather than failing when no line is found: the session the controller holds is what the
 * step rests on, and a device that served it without this line having reached the log has not failed
 * the case.
 */
export async function furtherSessionCheck(cx: CertStepContext, from: number): Promise<CheckRecord> {
    const dut = cx.devices.dut;
    if (dut.flavor !== "matterjs") {
        return { type: "device-log", verdict: "unverified", accepted: `no pattern for a ${dut.flavor} device` };
    }

    await dut.log.settled();
    const line = dut.log
        .window(from, dut.log.lines.length - from)
        .find(candidate => !candidate.synthetic && FURTHER_TCP_SESSION.test(candidate.text));

    const tag = line === undefined ? undefined : SESSION_TAG.exec(line.text)?.[1];
    return {
        type: "device-log",
        verdict: line === undefined ? "unverified" : "pass",
        pattern: FURTHER_TCP_SESSION.source,
        detail:
            line === undefined
                ? "the DUT's log carries no further session over TCP"
                : `the DUT accepted ${tag ?? "a further session"} over TCP`,
        matched: tag ?? line?.text,
        logLine: line?.index,
        accepted:
            line === undefined
                ? "the controller's own session id is what this step rests on; the device's line for a " +
                  "further session may not have reached its log"
                : undefined,
    };
}

/**
 * A CASE session the DUT accepted over TCP, established or resumed. Resumption counts: it is a CASE
 * session establishment, and a step demanding a full handshake would fail a DUT doing the
 * spec-preferred thing.
 *
 * Deliberately not {@link FURTHER_SESSION}, which matches a session on any transport because the case
 * using it asserts that *no* further session appeared.
 */
const FURTHER_TCP_SESSION = /CaseServer .*\(tcp\).*(?:New|Resumed) session with/;

export type TcpRef = CertNodeRef;
