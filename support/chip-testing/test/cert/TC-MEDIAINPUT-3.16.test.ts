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

const MEDIA_INPUT = Matter.clusters.require("MediaInput");

const commissioned = new CommissionedRefs();

certTest("TC-MEDIAINPUT-3.16", { plan: "media.adoc", pics: ["MEDIAINPUT.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends HideInputStatus command to TH",
        sendsTvCommand(commissioned, MEDIA_INPUT, "hideInputStatus", {}),
        { pics: "MEDIAINPUT.C.C02.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
