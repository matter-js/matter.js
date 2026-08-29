/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    noFurtherSessionCheck,
    regularSizedRequestCheck,
    TCP_FLAVORS,
    TCP_PICS,
    TCP_ROLES,
    TcpSessionRef,
    tcpInvokeCheck,
    tcpSessionStep,
    tcpStep,
} from "./tc-sc-8-support.js";
import { CommissionedRefs, describeError, recordAll, requireId } from "./tc-support.js";

const GENERAL_DIAGNOSTICS = Matter.clusters.require("GeneralDiagnostics");
const GENERAL_DIAGNOSTICS_ID = requireId(GENERAL_DIAGNOSTICS.id, "GeneralDiagnostics cluster");
const TIME_SNAPSHOT_ID = requireId(
    GENERAL_DIAGNOSTICS.commands.require("timeSnapshot").id,
    "GeneralDiagnostics.timeSnapshot",
);

const ROOT_ENDPOINT = 0;

const commissioned = new CommissionedRefs<"th">();
const session = new TcpSessionRef();

/**
 * The controller asks for nothing here beyond an ordinary invoke — no large payload, no transport of
 * its own — which is what the plan means by a request either transport could carry. What the step
 * then proves is that it went out on the session step 1 established rather than causing a new one.
 */
async function invokeOverExistingSession(cx: CertStepContext) {
    const node = cx.controllers.th.node(commissioned.require("th"));
    const tag = session.require();

    const dut = cx.devices.dut;
    const from = await dut.log.markSettled();

    let refusal: unknown;
    try {
        await node.invoke("GeneralDiagnostics", "timeSnapshot", {}, ROOT_ENDPOINT);
    } catch (e) {
        refusal = e;
    }

    const sized = await regularSizedRequestCheck(cx, tag, from);
    const invoked = await tcpInvokeCheck(cx, tag, ROOT_ENDPOINT, GENERAL_DIAGNOSTICS_ID, TIME_SNAPSHOT_ID, from);
    const alone = await noFurtherSessionCheck(cx, from);

    recordAll(cx, [
        {
            check: () => ({
                type: "response",
                verdict: refusal === undefined ? "pass" : "fail",
                detail:
                    refusal === undefined
                        ? "the TH received the command response"
                        : `the DUT refused TimeSnapshot: ${describeError(refusal)}`,
            }),
            what: "the TH received the command response",
        },
        { check: () => sized, what: "the request was one MRP could have carried" },
        { check: () => invoked, what: "the DUT answered it on the session step 1 established" },
        { check: () => alone, what: "no further session was established for it" },
    ]);
}

certTest("TC-SC-8.7", {
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
    .step(
        2,
        "TH initiates a regularly-sized InvokeCommandRequest with DUT, specifying that either a MRP or TCP-based session is usable.",
        tcpStep(invokeOverExistingSession),
        {
            expected: "Verify Command response received successfully at TH over the existing TCP-based session.",
        },
    )
    .finalize(async cx => {
        session.clear();
        await commissioned.decommissionAll(cx);
    });
