/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { CommissionedRefs, MATTERJS_NO_PAYLOAD, sendCommand } from "./tc-support.js";
import { WINDOW_COVERING, WINDOW_COVERING_ENDPOINT, windowCoveringPreconditions } from "./tc-wncv-support.js";

const commissioned = new CommissionedRefs();

/** A step that has the DUT send `command`, which has no parameters, and checks that the TH received none. */
function sendsCommand(command: string) {
    return commissioned.withRef("dut", (cx, ref) =>
        sendCommand(
            cx,
            ref,
            { cluster: WINDOW_COVERING, endpoint: WINDOW_COVERING_ENDPOINT, command, args: {} },
            { label: `${command} carries no parameters`, chip: [], matterjs: MATTERJS_NO_PAYLOAD },
        ),
    );
}

certTest("TC-WNCV-6.1", { plan: "window_covering.adoc", pics: ["WNCV.C"], app: "all-clusters" })
    .step(
        "0",
        "Preconditions: the DUT commissions the TH, and the TH supports the Lift and/or Tilt feature.",
        windowCoveringPreconditions(commissioned, features =>
            features.has("lift") || features.has("tilt") ? undefined : "the TH supports neither Lift nor Tilt",
        ),
        {
            expected:
                "The TH is commissioned onto the DUT's fabric and its FeatureMap has the LF and/or TL flag, as the " +
                "plan's preconditions require.",
        },
    )
    .step("1a", "DUT sends UpOrOpen command to TH", sendsCommand("upOrOpen"), {
        pics: "WNCV.C.C00.Tx",
        expected: "Verify TH responds w/ SUCCESS",
    })
    .step("2a", "DUT sends DownOrClose command to TH", sendsCommand("downOrClose"), {
        pics: "WNCV.C.C01.Tx",
        expected: "Verify TH responds w/ SUCCESS",
    })
    .step("3a", "DUT sends a StopMotion command to TH", sendsCommand("stopMotion"), {
        pics: "WNCV.C.C02.Tx",
        expected: "Verify TH responds w/ SUCCESS",
    })
    .finalize(cx => commissioned.decommissionAll(cx));
