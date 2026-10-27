/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import { certTest } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import { CommissionedRefs, MATTERJS_NO_PAYLOAD, sendCommand } from "./tc-support.js";

const WIFI_DIAGNOSTICS = Matter.clusters.require("WiFiNetworkDiagnostics");

/** chip's all-clusters app puts WiFiNetworkDiagnostics, with the ErrorCounts feature ResetCounts needs, on the root. */
const ENDPOINT = 0;

const commissioned = new CommissionedRefs();

certTest("TC-DGWIFI-3.2", {
    plan: "wifi_diagnostics.adoc",
    pics: ["DGWIFI.C"],
    app: "all-clusters",

    // matter.js's all-clusters test device has no WiFiNetworkDiagnostics cluster.
    flavors: ["chip-local", "chip-docker"],
})
    .step(1, "Commission TH to DUT", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        2,
        "DUT sends ResetCounts command to TH.",
        commissioned.withRef("dut", (cx, ref) =>
            sendCommand(
                cx,
                ref,
                { cluster: WIFI_DIAGNOSTICS, endpoint: ENDPOINT, command: "resetCounts", args: {} },
                { label: "ResetCounts carries no parameters", chip: [], matterjs: MATTERJS_NO_PAYLOAD },
            ),
        ),
        { pics: "DGWIFI.C.C00.Tx", expected: "Verify TH receives command and no errors are reported." },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
