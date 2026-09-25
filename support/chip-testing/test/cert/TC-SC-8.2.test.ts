/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    recordLargePayloadSession,
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
 * The claim this case makes and `TC-SC-8.1` does not: the session *allows* a large payload, which
 * only the TH can answer. A device can be observed carrying one — that is `TC-SC-8.6` — but nothing
 * it logs states what the session permits, so the evidence here is the TH's own account of the
 * session it established alongside the DUT's account of the connection beneath it.
 */
async function establishLargePayloadSession(cx: CertStepContext) {
    await tcpSessionStep(commissioned, session)(cx);

    await recordLargePayloadSession(
        cx,
        commissioned.require("th"),
        session.require().controllerSessionId,
        "the session the TH holds with the DUT reports itself as permitting payloads larger than an MRP session carries",
    );
}

certTest("TC-SC-8.2", {
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
        tcpStep(establishLargePayloadSession),
        {
            expected: "Verify that the session established with DUT allows large payloads.",
        },
    )
    .finalize(async cx => {
        session.clear();
        await commissioned.decommissionAll(cx);
    });
