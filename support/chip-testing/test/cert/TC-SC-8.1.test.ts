/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { TCP_FLAVORS, TCP_PICS, TCP_ROLES, TcpSessionRef, tcpSessionStep } from "./tc-sc-8-support.js";
import { CommissionedRefs } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();

/** This case makes no use of the session beyond establishing it, but the step captures one regardless. */
const session = new TcpSessionRef();

certTest("TC-SC-8.1", {
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
            expected: "Verify that a session is set up with an underlying TCP connection established with DUT.",
        },
    )
    .finalize(async cx => {
        session.clear();
        await commissioned.decommissionAll(cx);
    });
