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

/**
 * Tracks both THs seed, and not the active audio track. chip's tv-app answers INVALID_IN_STATE for a track it does not
 * list and ignores the output index; 1 is an output both THs seed, where CHIP's worked command sends 0, which is none.
 */
const AUDIO_TRACK_ID = "activeAudioTrackId_1";
const AUDIO_OUTPUT_INDEX = 1;
const TEXT_TRACK_ID = "activeTextTrackId_1";

const commissioned = new CommissionedRefs();

certTest("TC-MEDIAPLAYBACK-6.10", { plan: "media.adoc", pics: ["MEDIAPLAYBACK.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step(
        1,
        "DUT sends ActivateAudioTrack command to TH",
        sendsTvCommand(commissioned, MEDIA_PLAYBACK, "activateAudioTrack", {
            trackId: AUDIO_TRACK_ID,
            audioOutputIndex: AUDIO_OUTPUT_INDEX,
        }),
        { pics: "MEDIAPLAYBACK.C.C0c.Tx", expected: "Verify command is successfully received by TH" },
    )
    .step(
        2,
        "DUT sends ActivateTextTrack command to TH",
        sendsTvCommand(commissioned, MEDIA_PLAYBACK, "activateTextTrack", { trackId: TEXT_TRACK_ID }),
        { pics: "MEDIAPLAYBACK.C.C0d.Tx", expected: "Verify command is successfully received by TH" },
    )
    .step(
        3,
        "DUT sends DeactivateTextTrack command to TH",
        sendsTvCommand(commissioned, MEDIA_PLAYBACK, "deactivateTextTrack", {}),
        { pics: "MEDIAPLAYBACK.C.C0e.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
