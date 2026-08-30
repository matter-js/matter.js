/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    wildcardReadInOneReportCheck,
    TCP_FLAVORS,
    TCP_PICS,
    TCP_ROLES,
    TcpSessionRef,
    tcpSessionStep,
    tcpStep,
} from "./tc-sc-8-support.js";
import { CommissionedRefs, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();
const session = new TcpSessionRef();

/** Every attribute of every cluster of every endpoint, which is what the plan's step 2 reads. */
const WILDCARD = {};

/**
 * What a device-wide read has to come back with before the report it produced says anything: the
 * all-clusters device answers with hundreds of attributes across dozens of clusters, and a read that
 * returned a handful would make a small report unremarkable rather than a failure.
 */
const MIN_ATTRIBUTES = 100;
const MIN_CLUSTERS = 10;

/**
 * A wildcard read of the whole device is the interaction this case is named for: its report is far
 * larger than an MRP message may be, so a device that answers it in one `ReportData` can only have
 * done so over a large-payload session.
 */
async function readEverything(cx: CertStepContext) {
    const node = cx.controllers.th.node(commissioned.require("th"));
    const tag = session.require();

    const dut = cx.devices.dut;
    const from = await dut.log.markSettled();

    const entries = await node.readAttributes([WILDCARD]);

    const endpoints = new Set(entries.map(entry => entry.endpoint));
    const clusters = new Set(entries.map(entry => `${entry.endpoint}/${entry.cluster}`));
    const answered = await wildcardReadInOneReportCheck(cx, tag, from);

    recordAll(cx, [
        {
            check: () => ({
                type: "response",
                verdict: entries.length > MIN_ATTRIBUTES && clusters.size > MIN_CLUSTERS ? "pass" : "fail",
                detail: `${entries.length} attributes of ${clusters.size} clusters on ${endpoints.size} endpoints`,
            }),
            what: "the TH received attributes from across the DUT",
        },
        { check: () => answered, what: "the DUT answered the read in one large ReportData" },
    ]);
}

certTest("TC-SC-8.6", {
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
    .step(2, "TH initiates a Read of all attributes of all clusters of DUT", tcpStep(readEverything), {
        expected:
            "Verify DUT successfully transmits all the attribute data in one ReportData message to TH. Verify " +
            "receipt of ReportData message at TH.",
    })
    .finalize(async cx => {
        session.clear();
        await commissioned.decommissionAll(cx);
    });
