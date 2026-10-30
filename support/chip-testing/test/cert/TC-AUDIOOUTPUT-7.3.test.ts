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

const AUDIO_OUTPUT = Matter.clusters.require("AudioOutput");

/** An output both THs seed, and not the one they start on. */
const INDEX = 2;

const commissioned = new CommissionedRefs();

certTest("TC-AUDIOOUTPUT-7.3", { plan: "media.adoc", pics: ["AUDIOOUTPUT.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends SelectOutput command to TH",
        sendsTvCommand(commissioned, AUDIO_OUTPUT, "selectOutput", { index: INDEX }),
        { pics: "AUDIOOUTPUT.C.C00.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
