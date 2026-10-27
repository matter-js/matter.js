/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import { certTest } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import { CommissionedRefs, MATTERJS_NO_PAYLOAD, sendCommand } from "./tc-support.js";

const ETHERNET_DIAGNOSTICS = Matter.clusters.require("EthernetNetworkDiagnostics");

/** chip's all-clusters app puts EthernetNetworkDiagnostics, with the PacketCounts and ErrorCounts features, on the root. */
const ENDPOINT = 0;

const commissioned = new CommissionedRefs();

certTest("TC-DGETH-3.2", {
    plan: "ethernet_diagnostics.adoc",
    pics: ["DGETH.C"],
    app: "all-clusters",

    // matter.js's all-clusters test device has no EthernetNetworkDiagnostics cluster.
    flavors: ["chip-local", "chip-docker"],
})
    .step(1, "Commission TH to DUT", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        2,
        "DUT sends ResetCounts to TH.",
        commissioned.withRef("dut", (cx, ref) =>
            sendCommand(
                cx,
                ref,
                { cluster: ETHERNET_DIAGNOSTICS, endpoint: ENDPOINT, command: "resetCounts", args: {} },
                { label: "ResetCounts carries no parameters", chip: [], matterjs: MATTERJS_NO_PAYLOAD },
            ),
        ),
        { pics: "DGETH.C.C00.Tx", expected: "Verify TH receives command and no errors are seen." },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
