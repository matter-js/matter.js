/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import type { CommandPayload } from "./tc-support.js";
import { chipCommandField, CommissionedRefs, MATTERJS_NO_PAYLOAD, sendCommand } from "./tc-support.js";

const ON_OFF = Matter.clusters.require("OnOff");

/** Both THs put an OnOff cluster with the Lighting feature, which the last three commands need, on endpoint 1. */
const ENDPOINT = 1;

/**
 * `DyingLight` with the only variant the plan's step 4 allows for it. Not `DelayedAllOff` (0), so an identifier lost
 * on the way does not match the default.
 */
const EFFECT_IDENTIFIER_DYING_LIGHT = 1;
const EFFECT_VARIANT = 0;

/** In tenths of a second. Different values, so a TH log showing them swapped fails the field check. */
const ON_TIME = 50;
const OFF_WAIT_TIME = 30;

const commissioned = new CommissionedRefs();

/** Has the DUT invoke `command` on the TH's OnOff cluster; see {@link sendCommand}. */
function sendOnOff(
    cx: CertStepContext,
    ref: CertNodeRef,
    command: string,
    args: object,
    payload: CommandPayload,
): Promise<void> {
    return sendCommand(cx, ref, { cluster: ON_OFF, endpoint: ENDPOINT, command, args }, payload);
}

/** A step that has the DUT send `command`, which has no parameters, and checks that the TH received none. */
function sendsCommand(command: string) {
    return commissioned.withRef("dut", (cx, ref) =>
        sendOnOff(
            cx,
            ref,
            command,
            {},
            {
                label: `${command} carries no parameters`,
                chip: [],
                matterjs: MATTERJS_NO_PAYLOAD,
            },
        ),
    );
}

certTest("TC-OO-3.2", { plan: "onoff.adoc", pics: ["OO.C"], app: "all-clusters" })
    .step("0", "Preconditions: the DUT commissions the TH.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step(1, "DUT issues an Off command to the Test Harness.", sendsCommand("off"), {
        pics: "OO.C.C00.Tx",
        expected: "Test Harness receives the Off command from the DUT. The command has no parameters.",
    })
    .step(2, "DUT issues an On command to the Test Harness.", sendsCommand("on"), {
        pics: "OO.C.C01.Tx",
        expected: "Test Harness receives the On command from the DUT. The command has no parameters.",
    })
    .step(3, "DUT issues an Toggle command to the Test Harness.", sendsCommand("toggle"), {
        pics: "OO.C.C02.Tx",
        expected: "Test Harness receives the Toggle command from the DUT. The command has no parameters.",
    })
    .step(
        4,
        "DUT issues an OffWithEffect command to the Test Harness.",
        commissioned.withRef("dut", (cx, ref) =>
            sendOnOff(
                cx,
                ref,
                "offWithEffect",
                { effectIdentifier: EFFECT_IDENTIFIER_DYING_LIGHT, effectVariant: EFFECT_VARIANT },
                {
                    label: "OffWithEffect carries exactly EffectIdentifier (ID 0) and EffectVariant (ID 1)",
                    chip: [
                        chipCommandField({ id: 0, value: EFFECT_IDENTIFIER_DYING_LIGHT }),
                        chipCommandField({ id: 1, value: EFFECT_VARIANT }),
                    ],
                    matterjs: `effectIdentifier: ${EFFECT_IDENTIFIER_DYING_LIGHT} effectVariant: ${EFFECT_VARIANT}`,
                },
            ),
        ),
        {
            pics: "OO.C.C40.Tx",
            expected:
                "Test Harness receives the OffWithEffect command from the DUT. Verify the command has two parameters: " +
                "ID 0 (EffectIdentifier): the type is a uint8, the value has to be 0 or 1. ID 1 (EffectVariant): the " +
                "type is a uint8. If EffectIdentifier is 0 the value of EffectVariant has to be 0, 1 or 2. If " +
                "EffectIdentifier is 1 the value of EffectVariant has to be 0.",
        },
    )
    .step(
        5,
        "DUT issues an OnWithRecallGlobalScene command to the Test Harness.",
        sendsCommand("onWithRecallGlobalScene"),
        {
            pics: "OO.C.C41.Tx",
            expected:
                "Test Harness receives the OnWithRecallGlobalScene command from the DUT. The command has no parameters.",
        },
    )
    .step(
        6,
        "DUT issues an OnWithTimedOff command to the Test Harness.",
        commissioned.withRef("dut", (cx, ref) =>
            // AcceptOnlyWhenOn set, so OnOffControl is 0x01 on the wire and a bitmap that lost its bit does not match
            sendOnOff(
                cx,
                ref,
                "onWithTimedOff",
                { onOffControl: { acceptOnlyWhenOn: true }, onTime: ON_TIME, offWaitTime: OFF_WAIT_TIME },
                {
                    label:
                        "OnWithTimedOff carries exactly OnOffControl (ID 0) with AcceptOnlyWhenOn set, OnTime (ID 1) " +
                        "and OffWaitTime (ID 2)",
                    chip: [
                        chipCommandField({ id: 0, value: 1 }),
                        chipCommandField({ id: 1, value: ON_TIME }),
                        chipCommandField({ id: 2, value: OFF_WAIT_TIME }),
                    ],
                    matterjs: `onOffControl: { acceptOnlyWhenOn: true } onTime: ${ON_TIME} offWaitTime: ${OFF_WAIT_TIME}`,
                },
            ),
        ),
        {
            pics: "OO.C.C42.Tx",
            expected:
                "Test Harness receives the OnWithTimedOff command from the DUT. Verify the command has three " +
                "parameters: ID 0 (OnOffControl): the type is a map8, the value has to be 0x00 or 0x01. ID 1 " +
                "(OnTime): the type is a uint16. ID 2 (OffWaitTime): the type is a uint16.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
