/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    tcpInvokeCheck,
    TCP_FLAVORS,
    TCP_PICS,
    TCP_ROLES,
    TcpSessionRef,
    tcpSessionStep,
    tcpStep,
} from "./tc-sc-8-support.js";
import { CommissionedRefs, describeError, describeValue, recordAll, requireId } from "./tc-support.js";

const GENERAL_DIAGNOSTICS = Matter.clusters.require("GeneralDiagnostics");
const GENERAL_DIAGNOSTICS_ID = requireId(GENERAL_DIAGNOSTICS.id, "GeneralDiagnostics cluster");
const TIME_SNAPSHOT_ID = requireId(
    GENERAL_DIAGNOSTICS.commands.require("timeSnapshot").id,
    "GeneralDiagnostics.timeSnapshot",
);

/** GeneralDiagnostics is a root-node cluster. */
const ROOT_ENDPOINT = 0;

const commissioned = new CommissionedRefs<"th">();
const session = new TcpSessionRef();

/** `SystemTimeMs` of a `TimeSnapshotResponse`, or undefined for an answer that is not one. */
function systemTimeMsOf(response: unknown): number | bigint | undefined {
    if (typeof response !== "object" || response === null || !("systemTimeMs" in response)) {
        return undefined;
    }
    const value = response.systemTimeMs;
    return typeof value === "number" || typeof value === "bigint" ? value : undefined;
}

/**
 * `TimeSnapshot` is the command this case sends because it carries a response of its own and changes
 * nothing on the DUT: the plan asks only that a command response comes back, and a command that also
 * mutates the device would make a retry of this case depend on the state the previous one left.
 */
async function invokeOverTcp(cx: CertStepContext) {
    const node = cx.controllers.th.node(commissioned.require("th"));
    const tag = session.require();

    const dut = cx.devices.dut;
    const from = await dut.log.markSettled();

    let response: unknown;
    let refusal: unknown;
    try {
        response = await node.invoke("GeneralDiagnostics", "timeSnapshot", {}, ROOT_ENDPOINT);
    } catch (e) {
        refusal = e;
    }

    const systemTimeMs = refusal === undefined ? systemTimeMsOf(response) : undefined;
    const invoked = await tcpInvokeCheck(cx, tag, ROOT_ENDPOINT, GENERAL_DIAGNOSTICS_ID, TIME_SNAPSHOT_ID, from);

    recordAll(cx, [
        {
            check: () => ({
                type: "response",
                verdict: systemTimeMs === undefined ? "fail" : "pass",
                detail: responseDetail(response, refusal, systemTimeMs),
            }),
            what: "the TH received the command response",
        },
        {
            check: () => invoked,
            what: "the DUT dispatched the command and answered it on the session step 1 established",
        },
    ]);
}

/**
 * What the response check says it saw. A refused invoke is reported as the refusal rather than as a
 * missing field: the two failures have different causes and the evidence is where they are told apart.
 */
function responseDetail(response: unknown, refusal: unknown, systemTimeMs: number | bigint | undefined) {
    if (refusal !== undefined) {
        return `the DUT refused TimeSnapshot: ${describeError(refusal)}`;
    }
    if (systemTimeMs === undefined) {
        return `the DUT answered TimeSnapshot with ${describeValue(response)}, which carries no SystemTimeMs`;
    }
    return `TimeSnapshotResponse systemTimeMs=${systemTimeMs}`;
}

certTest("TC-SC-8.5", {
    plan: "securechannel.adoc",
    pics: TCP_PICS,
    app: "all-clusters",
    transport: "tcp",
    flavors: TCP_FLAVORS,
    ...TCP_ROLES,
})
    .step(
        1,
        "TH initiates a CASE session establishment with DUT, requesting a session supporting large payloads",
        tcpSessionStep(commissioned, session),
        {
            expected: "Verify that the session established with DUT allows large payloads.",
        },
    )
    .step(2, "TH initiates an InvokeCommandRequest with DUT over the established session", tcpStep(invokeOverTcp), {
        expected: "Verify Command response received successfully at TH.",
    })
    .finalize(async cx => {
        session.clear();
        await commissioned.decommissionAll(cx);
    });
