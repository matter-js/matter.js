/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import { certTest } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import { CommissionedRefs } from "./tc-support.js";
import { sendsTvCommand } from "./tc-tv-client-support.js";

const TARGET_NAVIGATOR = Matter.clusters.require("TargetNavigator");

/** Both THs seed TargetList with identifiers 1 and 2. */
const TARGET = 2;

const commissioned = new CommissionedRefs();

certTest("TC-TGTNAV-8.2", { plan: "media.adoc", pics: ["TGTNAV.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends NavigateTarget command to TH",
        sendsTvCommand(commissioned, TARGET_NAVIGATOR, "navigateTarget", { target: TARGET }),
        { pics: "TGTNAV.C.C00.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
