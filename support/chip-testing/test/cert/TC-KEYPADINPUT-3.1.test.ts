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

const KEYPAD_INPUT = Matter.clusters.require("KeypadInput");

/** CEC `Up`: a navigation key both THs accept, and not `Select` (0), so a key code lost on the way does not match. */
const KEY_CODE_UP = 1;

const commissioned = new CommissionedRefs();

certTest("TC-KEYPADINPUT-3.1", { plan: "media.adoc", pics: ["KEYPADINPUT.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends SendKey command to TH",
        sendsTvCommand(commissioned, KEYPAD_INPUT, "sendKey", { keyCode: KEY_CODE_UP }),
        { pics: "KEYPADINPUT.C.C00.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
