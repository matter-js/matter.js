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

/** The span CHIP's worked commands skip, in milliseconds. */
const DELTA_POSITION_MS = 10_000;

const commissioned = new CommissionedRefs();

certTest("TC-MEDIAPLAYBACK-6.7", { plan: "media.adoc", pics: ["MEDIAPLAYBACK.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step(1, "DUT sends Play command to TH", sendsTvCommand(commissioned, MEDIA_PLAYBACK, "play", {}), {
        pics: "MEDIAPLAYBACK.C.C00.Tx",
        expected: "Verify command is successfully received by TH",
    })
    .step(2, "DUT sends StartOver command to TH", sendsTvCommand(commissioned, MEDIA_PLAYBACK, "startOver", {}), {
        pics: "MEDIAPLAYBACK.C.C03.Tx",
        expected: "Verify command is successfully received by TH",
    })
    .step(3, "DUT sends Next command to TH", sendsTvCommand(commissioned, MEDIA_PLAYBACK, "next", {}), {
        pics: "MEDIAPLAYBACK.C.C05.Tx",
        expected: "Verify command is successfully received by TH",
    })
    .step(4, "DUT sends Previous command to TH", sendsTvCommand(commissioned, MEDIA_PLAYBACK, "previous", {}), {
        pics: "MEDIAPLAYBACK.C.C04.Tx",
        expected: "Verify command is successfully received by TH",
    })
    .step(
        5,
        "DUT sends SkipForward command to TH",
        sendsTvCommand(commissioned, MEDIA_PLAYBACK, "skipForward", { deltaPositionMilliseconds: DELTA_POSITION_MS }),
        { pics: "MEDIAPLAYBACK.C.C08.Tx", expected: "Verify command is successfully received by TH" },
    )
    .step(
        6,
        "DUT sends SkipBackward command to TH",
        sendsTvCommand(commissioned, MEDIA_PLAYBACK, "skipBackward", { deltaPositionMilliseconds: DELTA_POSITION_MS }),
        { pics: "MEDIAPLAYBACK.C.C09.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
