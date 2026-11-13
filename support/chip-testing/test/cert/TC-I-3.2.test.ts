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
import { chipCommandField, CommissionedRefs, sendCommand } from "./tc-support.js";

const IDENTIFY = Matter.clusters.require("Identify");

/** Both THs put Identify on the on/off light at endpoint 1. */
const ENDPOINT = 1;

/** The plan's own 0x003C (60 seconds). */
const IDENTIFY_TIME = 60;
const STOP_IDENTIFY = 0;

/** `Breathe`, which both THs support. Not 0, so an identifier lost on the way does not match the default. */
const EFFECT_IDENTIFIER_BREATHE = 1;
const EFFECT_VARIANT_DEFAULT = 0;

const commissioned = new CommissionedRefs();

/** Has the DUT invoke `command` on the TH's Identify cluster; see {@link sendCommand}. */
function sendIdentify(
    cx: CertStepContext,
    ref: CertNodeRef,
    command: string,
    args: object,
    payload: CommandPayload,
): Promise<void> {
    return sendCommand(cx, ref, { cluster: IDENTIFY, endpoint: ENDPOINT, command, args }, payload);
}

/** Has the DUT send Identify with `identifyTime`, the command's only field. */
function sendIdentifyTime(cx: CertStepContext, ref: CertNodeRef, identifyTime: number) {
    return sendIdentify(
        cx,
        ref,
        "identify",
        { identifyTime },
        {
            label: `Identify carries exactly IdentifyTime (ID 0) = ${identifyTime}`,
            chip: [chipCommandField({ id: 0, value: identifyTime })],
            matterjs: `identifyTime: ${identifyTime}`,
        },
    );
}

certTest("TC-I-3.2", { plan: "identify.adoc", pics: ["I.C"], app: "all-clusters" })
    .step("0", "Preconditions: the DUT commissions the TH.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step(
        1,
        "DUT issues an Identify command to the Test Harness, with the IdentifyTime argument set to 0x003C (60 " +
            "seconds) or a reasonable time that is supported by the DUT.",
        commissioned.withRef("dut", (cx, ref) => sendIdentifyTime(cx, ref, IDENTIFY_TIME)),
        {
            pics: "I.C.C00.Tx",
            expected:
                "Test Harness receives the Identify command from the DUT. It has one parameter (ID 0) of type uint16 " +
                "with a value != 0.",
        },
    )
    .step(
        2,
        "DUT issues an Identify command to the Test Harness, with the IdentifyTime argument set to 0x0000 (Stop).",
        commissioned.withRef("dut", (cx, ref) => sendIdentifyTime(cx, ref, STOP_IDENTIFY)),
        {
            pics: "I.C.C00.Tx",
            expected:
                "Test Harness receives the Identify command from the DUT. It has one parameter (ID 0) of type uint16 " +
                "with a value == 0.",
        },
    )
    .step(
        3,
        "DUT sends a TriggerEffect command to the Test Harness, with any supported EffectIdentifier argument and " +
            "EffectVariant set to 0.",
        commissioned.withRef("dut", (cx, ref) =>
            sendIdentify(
                cx,
                ref,
                "triggerEffect",
                { effectIdentifier: EFFECT_IDENTIFIER_BREATHE, effectVariant: EFFECT_VARIANT_DEFAULT },
                {
                    label: "TriggerEffect carries exactly EffectIdentifier (ID 0) and EffectVariant (ID 1)",
                    chip: [
                        chipCommandField({ id: 0, value: EFFECT_IDENTIFIER_BREATHE }),
                        chipCommandField({ id: 1, value: EFFECT_VARIANT_DEFAULT }),
                    ],
                    matterjs: `effectIdentifier: ${EFFECT_IDENTIFIER_BREATHE} effectVariant: ${EFFECT_VARIANT_DEFAULT}`,
                },
            ),
        ),
        {
            pics: "I.C.C40.Tx",
            expected:
                "Test Harness receives the TriggerEffect command from the DUT. Verify the command has two parameters: " +
                "ID 0: the type is an enum8, the value has to be 0x00, 0x01, 0x02, 0x0b 0xfe or 0xff. ID 1: the type " +
                "is an enum8, the value has to be 0x00.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
