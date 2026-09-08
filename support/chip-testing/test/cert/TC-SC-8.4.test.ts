/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    recordReestablishedSession,
    recordSeveredSession,
    TCP_FLAVORS,
    TCP_PICS,
    TCP_ROLES,
    TcpSessionRef,
    tcpSessionStep,
    tcpStep,
} from "./tc-sc-8-support.js";
import { CertCheckFailedError, CommissionedRefs } from "./tc-support.js";

const commissioned = new CommissionedRefs<"th">();
const session = new TcpSessionRef();

/** The session step 2 severed, which step 3 must not be answered by. */
const severed = new TcpSessionRef();

/**
 * Where the DUT's log stood before the sever.
 *
 * Step 3's corroborating check searches from here rather than from its own start: a controller may
 * re-establish the session on its own between the two steps, and a window opening after that would
 * miss the very line it looks for.
 */
let beforeSever: number | undefined;

async function severTheConnection(cx: CertStepContext) {
    severed.set(session.require());
    beforeSever = await cx.devices.dut.log.markSettled();
    await recordSeveredSession(cx, commissioned.require("th"), session);
}

/**
 * The claim that makes this case more than `TC-SC-8.3` with a third step: the session the TH ends up
 * with is a *different* one. An interaction requiring a large payload is what re-establishes it, so
 * the step cannot be satisfied by a fallback to MRP, and the TH's own session id is what tells the
 * new session from the severed one — the DUT is free to reuse a session id it has closed.
 */
async function reestablishTheSession(cx: CertStepContext) {
    if (beforeSever === undefined) {
        throw new CertCheckFailedError("step 2 took no mark before severing");
    }
    session.set(await recordReestablishedSession(cx, commissioned.require("th"), severed.require(), beforeSever));
}

certTest("TC-SC-8.4", {
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
    .step(3, "TH re-initiates CASE session establishment over TCP with DUT", tcpStep(reestablishTheSession), {
        expected: "Verify that a session is established over TCP with DUT that allows large payloads.",
    })
    .finalize(async cx => {
        beforeSever = undefined;
        severed.clear();
        session.clear();
        await commissioned.decommissionAll(cx);
    });
