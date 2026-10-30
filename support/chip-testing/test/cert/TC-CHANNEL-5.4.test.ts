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
 * The name of channel 9.1 on both THs. No other key of a seeded channel equals it, so chip's tv-app, which compares
 * every key at once and case-sensitively, finds the one match the spec's priority order finds.
 */
const MATCH = "PBS";

const commissioned = new CommissionedRefs();

certTest("TC-CHANNEL-5.4", { plan: "media.adoc", pics: ["CHANNEL.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends ChangeChannel command to TH",
        sendsTvCommand(commissioned, CHANNEL, "changeChannel", { match: MATCH }),
        { pics: "CHANNEL.C.C00.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
