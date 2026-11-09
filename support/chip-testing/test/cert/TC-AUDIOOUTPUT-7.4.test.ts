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

/** An output both THs seed, and the name CHIP's worked command sends; chip's tv-app refuses a name over 32 bytes. */
const INDEX = 1;
const NAME = "Kitchen Speakers";

const commissioned = new CommissionedRefs();

certTest("TC-AUDIOOUTPUT-7.4", { plan: "media.adoc", pics: ["AUDIOOUTPUT.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends RenameOutput command to TH",
        sendsTvCommand(commissioned, AUDIO_OUTPUT, "renameOutput", { index: INDEX, name: NAME }),
        { pics: "AUDIOOUTPUT.C.C01.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
