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

const CHANNEL = Matter.clusters.require("Channel");

/**
 * Channel 9.2, seeded on both THs and not the one they start on: chip's tv-app answers FAILURE for a change to the
 * current channel.
 */
const MAJOR_NUMBER = 9;
const MINOR_NUMBER = 2;

const commissioned = new CommissionedRefs();

certTest("TC-CHANNEL-5.5", { plan: "media.adoc", pics: ["CHANNEL.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends ChangeChannelByNumber command to TH",
        sendsTvCommand(commissioned, CHANNEL, "changeChannelByNumber", {
            majorNumber: MAJOR_NUMBER,
            minorNumber: MINOR_NUMBER,
        }),
        { pics: "CHANNEL.C.C02.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
