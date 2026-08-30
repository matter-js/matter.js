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
    timeSnapshotResponseCheck,
} from "./tc-sc-8-support.js";
import { CommissionedRefs, recordAll, requireId } from "./tc-support.js";

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

    const invoked = await tcpInvokeCheck(cx, tag, ROOT_ENDPOINT, GENERAL_DIAGNOSTICS_ID, TIME_SNAPSHOT_ID, from);

    recordAll(cx, [
        { check: () => timeSnapshotResponseCheck(response, refusal), what: "the TH received the command response" },
        {
            check: () => invoked,
            what: "the DUT dispatched the command and answered it on the session step 1 established",
        },
    ]);
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
