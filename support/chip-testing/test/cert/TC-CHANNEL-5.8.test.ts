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

/** A one-hour window; matter.js's TH answers INVALID_ACTION when StartTime is after EndTime. */
const GUIDE_START = 1_700_000_000;
const GUIDE_END = GUIDE_START + 3600;

/** A program of chip's tv-app guide (`ChannelManager`); both THs answer success for any identifier. */
const PROGRAM = { programIdentifier: "progid-abc1", shouldRecordSeries: false };

const commissioned = new CommissionedRefs();

certTest("TC-CHANNEL-5.8", { plan: "media.adoc", pics: ["CHANNEL.C"], app: "tv" })
    .step("0", "Test setup: commission TH to DUT.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step(
        1,
        "DUT sends GetProgramGuide command to TH",
        sendsTvCommand(commissioned, CHANNEL, "getProgramGuide", { startTime: GUIDE_START, endTime: GUIDE_END }),
        { pics: "CHANNEL.C.C04.Tx", expected: "Verify command is successfully received by TH" },
    )
    .step(2, "DUT sends RecordProgram command to TH", sendsTvCommand(commissioned, CHANNEL, "recordProgram", PROGRAM), {
        pics: "CHANNEL.C.C06.Tx",
        expected: "Verify command is successfully received by TH",
    })
    .step(
        3,
        "DUT sends CancelRecordProgram command to TH",
        sendsTvCommand(commissioned, CHANNEL, "cancelRecordProgram", PROGRAM),
        { pics: "CHANNEL.C.C07.Tx", expected: "Verify command is successfully received by TH" },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
