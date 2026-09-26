/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    recordSeveredSession,
    TCP_FLAVORS,
    TCP_PICS,
    TCP_ROLES,
    TcpSessionRef,
    tcpSessionStep,
    tcpStep,
} from "./tc-sc-8-support.js";
import { CommissionedRefs } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();
const session = new TcpSessionRef();

/**
 * The TH drops the connection beneath the session rather than closing the session, which a
 * `CloseSession` would do: telling the DUT to forget the session is this case's expected outcome, so
 * it cannot also be the stimulus. What the step then requires is that both sides agree the session
 * went — the DUT evicted it, and the TH no longer holds it.
 */
async function severTheConnection(cx: CertStepContext) {
    await recordSeveredSession(cx, commissioned.require("th"), session);
}

certTest("TC-SC-8.3", {
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
            expected: "Verify that a session is established over TCP with DUT that allows large payloads.",
        },
    )
    .step(2, "TH closes the TCP connection with DUT", tcpStep(severTheConnection), {
        expected: "Verify that the secure session with DUT is inactive.",
    })
    .finalize(async cx => {
        session.clear();
        await commissioned.decommissionAll(cx);
    });
