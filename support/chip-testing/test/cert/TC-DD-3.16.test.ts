/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    ABSENT_DEVICE_GIVE_UP,
    ABSENT_DEVICE_WAIT,
    checkGeneratedManualCode,
    CommissioningRefusals,
    DISCRIMINATOR_MSB,
    INVALID_PASSCODES,
    MANUAL_CODE_GUIDELINES,
    manualPairingCode,
    recordGeneratedManualCode,
    recordManualParse,
    SHORT_DISCRIMINATOR_SHIFT,
    thElevenDigitCodeParts,
    thPrintedManualCode,
} from "./tc-dd-support.js";
import type { ManualPairingCodeParts } from "./tc-dd-support.js";
import { recordAll, runCleanups, theTh } from "./tc-support.js";

const refusals = new CommissioningRefusals();

const PROVIDE =
    "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the DUT";

const TERMINATES =
    "DUT attempts to parse the Manual Pairing Code and DUT terminates the commissioning process in a DUT-specific " +
    "manner according to the DUT manufacturer's instructions.";

const GENERATED = `User has a manual code generated to pass into DUT. ${MANUAL_CODE_GUIDELINES}`;

/**
 * Step 1's code and the parts every substitution starts from. Each generated code is checked against
 * the TH's printed code with `unchangedFrom`, which is what makes it "the manual code from Step 1".
 */
async function source(cx: CertStepContext): Promise<{ code: string; parts: ManualPairingCodeParts }> {
    return { code: await thPrintedManualCode(theTh(cx)), parts: thElevenDigitCodeParts(cx) };
}

/** The TH's code with `overrides` applied. */
function substituted(parts: ManualPairingCodeParts, overrides: Partial<ManualPairingCodeParts>): string {
    return manualPairingCode({ ...parts, ...overrides });
}

function wrongCheckDigit(code: string): number {
    return (Number(code.slice(-1)) + 1) % 10;
}

certTest("TC-DD-3.16", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.11_MANUAL_PC"],
    app: "all-clusters",
})
    .step(
        1,
        "Provide the 11-digit Manual Pairing Code from the Commissionee to the DUT in any format supported by DUT",
        async cx => {
            await recordManualParse(cx, (await source(cx)).code);
        },
        { expected: "Verify that the Manual Pairing Code can be provided to DUT" },
    )
    .step(
        "2.a",
        "VERSION: Using the manual code from Step 1, generate a new manual code but substituting out the current " +
            "VERSION with an invalid VERSION: 2",
        async cx => {
            // The marker occupies the whole first digit (§ 5.1.4.1.2), so the discriminator's two MSBs
            // cannot survive alongside it; the passcode has to, or step 2.b would be refusing the code
            // for the wrong reason
            const { code, parts } = await source(cx);
            recordGeneratedManualCode(
                cx,
                substituted(parts, { futureFormat: true }),
                {
                    futureFormat: true,
                    vidPidPresent: false,
                    shortDiscriminator: (parts.discriminator >> SHORT_DISCRIMINATOR_SHIFT) & 0x03,
                    unchangedFrom: code,
                },
                "Reserved-version code",
            );
        },
        { expected: GENERATED },
    )
    .step(
        "2.b",
        PROVIDE,
        async cx => {
            const parts = thElevenDigitCodeParts(cx);
            await refusals.requireRefusal(
                cx,
                { manualPairingCode: substituted(parts, { futureFormat: true }) },
                "Reserved-version code refused",
            );
        },
        { expected: TERMINATES },
    )
    .step(
        "3.a",
        "VID_PID_PRESENT: Using the manual code from Step 1, generate a new manual code but substituting out the " +
            "current VID_PID_PRESENT with an invalid VID_PID_PRESENT set to 1",
        async cx => {
            const { code, parts } = await source(cx);
            recordGeneratedManualCode(
                cx,
                substituted(parts, { vidPidPresent: true }),
                { vidPidPresent: true, unchangedFrom: code },
                "Header/length mismatch code",
            );
        },
        { expected: GENERATED },
    )
    .step(
        "3.b",
        PROVIDE,
        async cx => {
            const parts = thElevenDigitCodeParts(cx);
            await refusals.requireRefusal(
                cx,
                { manualPairingCode: substituted(parts, { vidPidPresent: true }) },
                "Header/length mismatch refused",
            );
        },
        { expected: TERMINATES },
    )
    .step(
        "4.a",
        "SHORT DISCRIMINATOR: Using the manual code from Step 1, generate a new manual code but substituting out " +
            "the current SHORT DISCRIMINATOR string with a discriminator value that makes the generated manual code " +
            "differ from Step 1's manual code (i.e. Choose a discriminator value that changes any of the 4 " +
            "most-significant bits of Step 1's 12-bit discriminator value and adheres to rules of section 5.1.1.5. " +
            '"Discriminator value")',
        async cx => {
            const { code, parts } = await source(cx);
            const discriminator = parts.discriminator ^ DISCRIMINATOR_MSB;
            recordGeneratedManualCode(
                cx,
                substituted(parts, { discriminator }),
                {
                    shortDiscriminator: discriminator >> SHORT_DISCRIMINATOR_SHIFT,
                    differsFrom: code,
                    unchangedFrom: code,
                },
                "Wrong-discriminator code",
            );
        },
        { expected: GENERATED },
    )
    .step(
        "4.b",
        PROVIDE,
        async cx => {
            const parts = thElevenDigitCodeParts(cx);
            await refusals.requireGiveUp(
                cx,
                {
                    manualPairingCode: substituted(parts, { discriminator: parts.discriminator ^ DISCRIMINATOR_MSB }),
                    giveUpAfterMs: ABSENT_DEVICE_GIVE_UP,
                },
                "No device commissioned from the wrong discriminator",
                ABSENT_DEVICE_WAIT,
            );
        },
        { expected: TERMINATES },
    )
    .step(
        "5.a",
        "Passcode: Using the manual code from Step 1, generate a new manual code using all the same Onboarding " +
            "Payload components except for the Passcode. For each Passcode in the following list, set the Passcode " +
            "component to one of the invalid Passcode and generate a new manual code using all the same Onboarding " +
            "Payload components and one Passcode from the list: 00000000, 11111111, 22222222, 33333333, 44444444, " +
            "55555555, 66666666, 77777777, 88888888, 99999999, 12345678, 87654321",
        async cx => {
            const { code, parts } = await source(cx);
            await recordAll(
                cx,
                INVALID_PASSCODES.map(passcode => ({
                    check: () =>
                        checkGeneratedManualCode(substituted(parts, { passcode }), { passcode, unchangedFrom: code }),
                    what: `Code carrying passcode ${passcode}`,
                })),
            );
        },
        {
            expected:
                "User has 12 manual codes (one for each passcode in the list of invalid passcodes) generated to " +
                `pass into DUT. ${MANUAL_CODE_GUIDELINES}`,
        },
    )
    .step(
        "5.b",
        "Provide each of the Manual Pairing Codes, generated in the previous step, to the DUT in any format " +
            "supported by the DUT",
        async cx => {
            const parts = thElevenDigitCodeParts(cx);
            await refusals.requireEachRefused(
                cx,
                INVALID_PASSCODES.map(passcode => ({
                    target: { manualPairingCode: substituted(parts, { passcode }) },
                    what: `Code carrying passcode ${passcode} refused`,
                })),
            );
        },
        { expected: TERMINATES },
    )
    .step(
        "6.a",
        "CHECK_DIGIT: Using the manual code from Step 1, generate a new manual code but substituting out the " +
            "current CHECK_DIGIT with an invalid CHECK_DIGIT (i.e. Any different CHECK_DIGIT than the commissionee's " +
            "CHECK_DIGIT while following Table 38. Encoding Method without Vendor and Product ID's " +
            "(VID_PID_Present == 0))",
        async cx => {
            const { code, parts } = await source(cx);
            recordGeneratedManualCode(
                cx,
                substituted(parts, { checkDigit: wrongCheckDigit(code) }),
                { checkDigitCorrect: false, differsFrom: code, unchangedFrom: code },
                "Wrong-check-digit code",
            );
        },
        { expected: GENERATED },
    )
    .step(
        "6.b",
        PROVIDE,
        async cx => {
            const { code, parts } = await source(cx);
            await refusals.requireRefusal(
                cx,
                { manualPairingCode: substituted(parts, { checkDigit: wrongCheckDigit(code) }) },
                "Wrong-check-digit code refused",
            );
        },
        { expected: TERMINATES },
    )
    .finalize(cx => runCleanups(() => refusals.settle(cx)));
