/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext, CheckRecord, DeviceFlavor } from "@matter/testing";
import { resolveControllerImplementation, UnsupportedByControllerError } from "@matter/testing";
import {
    CertCheckFailedError,
    CommissionedRefs,
    describeValue,
    expectSequence,
    literally,
    LOG_TIMEOUT,
    matterjsCommandPath,
    record,
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

    await th.node(ref).readAttribute({ endpoint: 0, cluster: BASIC_INFORMATION_ID, attribute: VENDOR_NAME_ID });

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
export async function recordTcpSession(cx: CertStepContext, from: number, what: string): Promise<string> {
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

    return tag;
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
        return invoked;
    }

    // The answer has to be this invoke's own, and an exchange is what makes it so: a second invoke on
    // the same session would otherwise supply the response lines
    const exchange = EXCHANGE.exec(invoked.matched)?.[1];
    if (exchange === undefined) {
        return {
            type: "device-log",
            verdict: "fail",
            pattern: EXCHANGE.source,
            detail: `the DUT's invoke line names no exchange: ${invoked.matched}`,
            logLine: invoked.logLine,
        };
    }

    const onExchange = `${onSession}⇵${exchange}`;
    return expectSequence(
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
 * @see {@link MatterSpecification.v141.Core} § 4.4.4
 */
const LARGE_PAYLOAD_FLOOR = 1280;

/** The payload size matter.js prints on a message line — the encoded message, without its framing. */
const REPORT_SIZE = /\bsize: (\d+)\b/;

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
        // The path is what tells this read from any other on the session — commissioning performs a
        // single-attribute read moments earlier
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

    const sizes = reports.map(line => Number(REPORT_SIZE.exec(line.text)?.[1] ?? Number.NaN));
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

/** Where a TCP case keeps the session its first step established, for the steps that follow. */
export class TcpSessionRef {
    #tag?: string;

    set(tag: string) {
        this.#tag = tag;
    }

    require(): string {
        if (this.#tag === undefined) {
            throw new CertCheckFailedError("no TCP session was captured");
        }
        return this.#tag;
    }

    clear() {
        this.#tag = undefined;
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
        const { from } = await commissionOverTcp(cx, commissioned);
        session.set(
            await recordTcpSession(
                cx,
                from,
                "the session the TH established with the DUT runs over TCP, which is what makes it large-payload-capable",
            ),
        );
    };
}

export type TcpRef = CertNodeRef;
