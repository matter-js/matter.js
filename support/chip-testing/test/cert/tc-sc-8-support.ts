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
    const check = await expectSequence(
        dut.log,
        dut.flavor,
        "CASE session established over a TCP connection",
        {
            matterjs: {
                ordered: [/CaseServer .*\(tcp\).*Pairing request « tcp:\/\//, /CaseServer .*\(tcp\).*New session with/],
            },
        },
        from,
        LOG_TIMEOUT,
    );
    record(cx, check, what);

    const tag = check.matched === undefined ? undefined : SESSION_TAG.exec(check.matched)?.[1];
    if (tag === undefined) {
        const detail = `the DUT's session line names no TCP session: ${check.matched}`;
        cx.recorder.check({
            type: "device-log",
            verdict: "fail",
            pattern: SESSION_TAG.source,
            detail,
            logLine: check.logLine,
        });
        throw new CertCheckFailedError(detail);
    }

    return tag;
}

/**
 * The session part of a matter.js session tag — `@<fabric>:<node>•<id>`, which the transport marker
 * `(tcp)` follows.
 */
const SESSION_TAG = /(@[0-9a-f]+:[0-9a-f]+•[0-9a-f]+)\(tcp\)/;

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
    const onSession = `${literally(session)}\\(tcp\\)⇵[0-9a-f]+`;
    const path = matterjsCommandPath(endpoint, cluster, command);
    return expectSequence(
        dut.log,
        dut.flavor,
        `an invoke of ${endpoint}/${cluster}/${command} answered with an InvokeResponse on ${session}`,
        {
            matterjs: {
                ordered: [
                    // The invoke line carries the timed/suppress-response flags between the session
                    // and its path, and drops them when neither is set
                    new RegExp(`InteractionServer Invoke « ${onSession}.*invokes: .*?${path}`),
                    new RegExp(`InteractionServer Invoke \\(final\\) » ${onSession} commands: 1(?!\\d)`),
                    new RegExp(`Message » for: I/InvokeResponse id: ${onSession}`),
                ],
            },
        },
        from,
        LOG_TIMEOUT,
    );
}

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
