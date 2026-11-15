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

/** A negative count, so a count that loses its sign on the way does not match; both THs wrap to the last channel. */
const COUNT = -1;

const commissioned = new CommissionedRefs();

certTest("TC-CHANNEL-5.6", { plan: "media.adoc", pics: ["CHANNEL.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the step below runs over CASE.",
    })
    .step(
        1,
        "DUT sends SkipChannel command to TH",
        sendsTvCommand(commissioned, CHANNEL, "skipChannel", { count: COUNT }),
        { pics: "CHANNEL.C.C03.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
