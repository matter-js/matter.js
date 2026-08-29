/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext, DeviceFlavor } from "@matter/testing";
import { resolveControllerImplementation, UnsupportedByControllerError } from "@matter/testing";
import { CommissionedRefs, expectSequence, LOG_TIMEOUT, record, requireId } from "./tc-support.js";

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
function requireTcpCapableController() {
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
 */
export async function recordTcpSession(cx: CertStepContext, from: number, what: string) {
    const dut = cx.devices.dut;
    record(
        cx,
        await expectSequence(
            dut.log,
            dut.flavor,
            "CASE session established over a TCP connection",
            {
                matterjs: {
                    ordered: [
                        /CaseServer .*\(tcp\).*Pairing request « tcp:\/\//,
                        /CaseServer .*\(tcp\).*New session with/,
                    ],
                },
            },
            from,
            LOG_TIMEOUT,
        ),
        what,
    );
}

/** Every TCP case starts the same way, so its first step is shared rather than copied. */
export function tcpSessionStep(commissioned: CommissionedRefs<"th">) {
    return async (cx: CertStepContext) => {
        const { from } = await commissionOverTcp(cx, commissioned);
        await recordTcpSession(cx, from, "the session the TH established with the DUT runs over TCP");
    };
}

export type TcpRef = CertNodeRef;
