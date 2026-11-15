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

const CONTENT_LAUNCHER = Matter.clusters.require("ContentLauncher");

/**
 * ParameterEnum `Channel` with a value chip's tv-app seeds for its first content entry, so chip's log reports a match.
 * Neither TH answers a search without a match differently; the non-zero type and the TRUE AutoPlay make a value lost on
 * the way fail the payload check.
 */
const SEARCH = { parameterList: [{ type: 1, value: "PBS" }] };

const commissioned = new CommissionedRefs();

certTest("TC-CONTENTLAUNCHER-10.4", { plan: "media.adoc", pics: ["CONTENTLAUNCHER.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends LaunchContent command to TH",
        sendsTvCommand(commissioned, CONTENT_LAUNCHER, "launchContent", { search: SEARCH, autoPlay: true }),
        { pics: "CONTENTLAUNCHER.C.C00.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
