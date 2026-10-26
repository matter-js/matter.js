/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import { certTest } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import { CommissionedRefs, MATTERJS_NO_PAYLOAD, sendCommand } from "./tc-support.js";

const SOFTWARE_DIAGNOSTICS = Matter.clusters.require("SoftwareDiagnostics");

/** chip's all-clusters app puts SoftwareDiagnostics, with the Watermarks feature ResetWatermarks needs, on the root. */
const ENDPOINT = 0;

const commissioned = new CommissionedRefs();

certTest("TC-DGSW-3.2", {
    plan: "software_diagnostics.adoc",
    pics: ["DGSW.C"],
    app: "all-clusters",

    // matter.js's all-clusters test device has no SoftwareDiagnostics cluster.
    flavors: ["chip-local", "chip-docker"],
})
    .step(1, "Commission TH to DUT", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        2,
        "DUT sends ResetWatermarks to TH.",
        commissioned.withRef("dut", (cx, ref) =>
            sendCommand(
                cx,
                ref,
                { cluster: SOFTWARE_DIAGNOSTICS, endpoint: ENDPOINT, command: "resetWatermarks", args: {} },
                { label: "ResetWatermarks carries no parameters", chip: [], matterjs: MATTERJS_NO_PAYLOAD },
            ),
        ),
        { pics: "DGSW.C.C00.Tx", expected: "Verify TH receives command and no errors are seen." },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
