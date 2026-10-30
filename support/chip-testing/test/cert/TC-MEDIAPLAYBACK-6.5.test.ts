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

const MEDIA_PLAYBACK = Matter.clusters.require("MediaPlayback");

const commissioned = new CommissionedRefs();

certTest("TC-MEDIAPLAYBACK-6.5", { plan: "media.adoc", pics: ["MEDIAPLAYBACK.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step(1, "DUT sends Play command to TH", sendsTvCommand(commissioned, MEDIA_PLAYBACK, "play", {}), {
        pics: "MEDIAPLAYBACK.C.C00.Tx",
        expected: "Verify command is successfully received by TH",
    })
    .step(2, "DUT sends Pause command to TH", sendsTvCommand(commissioned, MEDIA_PLAYBACK, "pause", {}), {
        pics: "MEDIAPLAYBACK.C.C01.Tx",
        expected: "Verify command is successfully received by TH",
    })
    .step(3, "DUT sends Stop command to TH", sendsTvCommand(commissioned, MEDIA_PLAYBACK, "stop", {}), {
        pics: "MEDIAPLAYBACK.C.C02.Tx",
        expected: "Verify command is successfully received by TH",
    })
    .finalize(cx => commissioned.decommissionAll(cx));
