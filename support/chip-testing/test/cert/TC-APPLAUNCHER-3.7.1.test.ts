/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import { certTest } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import { CommissionedRefs } from "./tc-support.js";
import { sendsTvCommand, TV_KNOWN_APPLICATION } from "./tc-tv-client-support.js";

const APPLICATION_LAUNCHER = Matter.clusters.require("ApplicationLauncher");

const commissioned = new CommissionedRefs();

certTest("TC-APPLAUNCHER-3.7.1", { plan: "media.adoc", pics: ["APPLAUNCHER.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends LaunchApp command to TH",
        sendsTvCommand(commissioned, APPLICATION_LAUNCHER, "launchApp", { application: TV_KNOWN_APPLICATION }),
        { pics: "APPLAUNCHER.C.C00.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
