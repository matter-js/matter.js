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

/** An input both THs seed; chip's tv-app refuses a name longer than 32 bytes. */
const INDEX = 1;
const NAME = "HDMI 1";

const commissioned = new CommissionedRefs();

certTest("TC-MEDIAINPUT-3.17", { plan: "media.adoc", pics: ["MEDIAINPUT.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends RenameInput command to TH",
        sendsTvCommand(commissioned, MEDIA_INPUT, "renameInput", { index: INDEX, name: NAME }),
        { pics: "MEDIAINPUT.C.C03.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
