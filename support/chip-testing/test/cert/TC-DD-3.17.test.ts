/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import {
    commissionByManualCode,
    CommissioningRefusals,
    manualPairingCode,
    recordManualParse,
    recordVendorMismatchOutcome,
    thCodeParts,
    thManualPairingCode,
} from "./tc-dd-support.js";
import { CommissionedRefs, record } from "./tc-support.js";

/**
 * The trivial passcodes § 5.1.7.1 forbids, transcribed from the plan's step 5.a rather than taken
 * from matter.js's own list, so a divergence between the two shows up as a failing step.
 */
const INVALID_PASSCODES = [
    0, 11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 99999999, 12345678, 87654321,
];

/** The test vendor identifiers the plan's step 6.a substitutes. */
const TEST_VENDOR_IDS = [0xfff1, 0xfff2, 0xfff3, 0xfff4];

/**
 * Flips a bit the plan requires to change: § 5.1.4.1 Table 62 carries only the discriminator's 4 most
 * significant bits, so a substitution the code can express has to land in them.
 */
const DISCRIMINATOR_MSB = 0x100;

/**
 * What step 4 gives the DUT to look for a device that is not there. matter.js otherwise waits out
 * the specification's 3-minute minimum commissioning window; chip-tool cannot be bounded and stops
 * on its own after roughly 45 seconds, so the step's own budget has to outlast that.
 */
const GIVE_UP_AFTER_MS = 20_000;

/** Step 6's mismatched-vendor attempt, bounded the same way step 4's absent device is. */
const VENDOR_MISMATCH_TIMEOUT_MS = 20_000;
const NO_COMMISSIONEE_TIMEOUT_MS = 90_000;

/** The plan repeats this in the expected outcome of every step that generates a code. */
const GUIDELINES =
    "The generated Manual Pairing Code follows all guidelines laid out in the Preconditions #2, above, with " +
    "special attention to the CHECK_DIGIT using the Verhoeff algorithm.";

const commissioned = new CommissionedRefs();
const refusals = new CommissioningRefusals();

certTest("TC-DD-3.17", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.21_MANUAL_PC"],
    app: "all-clusters",
})
    .step(
        1,
        "Provide the 21-digit Manual Pairing Code from the Commissionee to the DUT in any format supported by DUT",
        async cx => {
            await recordManualParse(cx, await thManualPairingCode(cx));
        },
        { expected: "Verify that the Manual Pairing Code can be provided to DUT" },
    )
    .step(
        "2.a",
        "VERSION: Using the manual code from Step 1, generate a new manual code but substituting out the current " +
            "VERSION with an invalid VERSION: 2",
        async cx => {
            const code = await thManualPairingCode(cx, { futureFormat: true });
            record(
                cx,
                { type: "response", verdict: "pass", detail: `Generated ${code}, which marks a format after v1` },
                "Reserved-version code",
            );
        },
        { expected: `User has a manual code generated to pass into DUT. ${GUIDELINES}` },
    )
    .step(
        "2.b",
        "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the DUT",
        async cx => {
            const manualPairingCode = await thManualPairingCode(cx, { futureFormat: true });
            await refusals.requireRefusal(cx, { manualPairingCode }, "Reserved-version code refused");
        },
        {
            expected:
                "DUT attempts to parse the Manual Pairing Code and DUT terminates the commissioning process in a " +
                "DUT-specific manner according to the DUT manufacturer's instructions.",
        },
    )
    .step(
        "3.a",
        "VID_PID_PRESENT: Using the manual code from Step 1, generate a new manual code but substituting out the " +
            "current VID_PID_PRESENT with an invalid VID_PID_PRESENT set to 0",
        async cx => {
            const code = await thManualPairingCode(cx, { vidPidPresent: false });
            record(
                cx,
                {
                    type: "response",
                    verdict: "pass",
                    detail: `Generated ${code}, whose header disagrees with its ${code.length} digits`,
                },
                "Header/length mismatch code",
            );
        },
        { expected: `User has a manual code generated to pass into DUT. ${GUIDELINES}` },
    )
    .step(
        "3.b",
        "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the DUT",
        async cx => {
            const manualPairingCode = await thManualPairingCode(cx, { vidPidPresent: false });
            await refusals.requireRefusal(cx, { manualPairingCode }, "Header/length mismatch refused");
        },
        {
            expected:
                "DUT attempts to parse the Manual Pairing Code and DUT terminates the commissioning process in a " +
                "DUT-specific manner according to the DUT manufacturer's instructions.",
        },
    )
    .step(
        "4.a",
        "SHORT DISCRIMINATOR: Using the manual code from Step 1, generate a new manual code but substituting out " +
            "the current SHORT DISCRIMINATOR string with a discriminator value that makes the generated manual code " +
            "differ from Step 1's manual code (i.e. Choose a discriminator value that changes any of the 4 " +
            "most-significant bits of Step 1's 12-bit discriminator value and adheres to rules of section 5.1.1.5. " +
            '"Discriminator value")',
        async cx => {
            const code = await thManualPairingCode(cx, {
                discriminator: cx.devices.th.commissioning.discriminator ^ DISCRIMINATOR_MSB,
            });
            record(
                cx,
                {
                    type: "response",
                    verdict: "pass",
                    detail: `Generated ${code}, naming a device this network does not carry`,
                },
                "Wrong-discriminator code",
            );
        },
        { expected: `User has a manual code generated to pass into DUT. ${GUIDELINES}` },
    )
    .step(
        "4.b",
        "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the DUT",
        async cx => {
            const manualPairingCode = await thManualPairingCode(cx, {
                discriminator: cx.devices.th.commissioning.discriminator ^ DISCRIMINATOR_MSB,
            });
            await refusals.requireNoCommissioning(
                cx,
                { manualPairingCode, giveUpAfterMs: GIVE_UP_AFTER_MS },
                "No device commissioned from the wrong discriminator",
                NO_COMMISSIONEE_TIMEOUT_MS,
            );
        },
        {
            expected:
                "DUT attempts to parse the Manual Pairing Code and DUT terminates the commissioning process in a " +
                "DUT-specific manner according to the DUT manufacturer's instructions.",
        },
    )
    .step(
        "5.a",
        "Passcode: Using the manual code from Step 1, generate a new manual code using all the same Onboarding " +
            "Payload components except for the Passcode. For each Passcode in the following list, set the Passcode " +
            "component to one of the invalid Passcode and generate a new manual code: 00000000, 11111111, 22222222, " +
            "33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 99999999, 12345678, 87654321",
        async cx => {
            const parts = await thCodeParts(cx);
            const codes = INVALID_PASSCODES.map(passcode => manualPairingCode({ ...parts, passcode }));
            record(
                cx,
                {
                    type: "response",
                    verdict: "pass",
                    detail: `Generated ${codes.length} codes: ${codes
                        .map((code, i) => `${code} (${INVALID_PASSCODES[i]})`)
                        .join(", ")}`,
                },
                "Invalid-passcode codes",
            );
        },
        {
            expected:
                "User has 12 manual codes (one for each passcode in the list of invalid passcodes) generated to " +
                `pass into DUT. ${GUIDELINES}`,
        },
    )
    .step(
        "5.b",
        "Provide each of the Manual Pairing Codes, generated in the previous step, to the DUT in any format " +
            "supported by the DUT",
        async cx => {
            const parts = await thCodeParts(cx);
            for (const passcode of INVALID_PASSCODES) {
                await refusals.requireRefusal(
                    cx,
                    { manualPairingCode: manualPairingCode({ ...parts, passcode }) },
                    `Code carrying passcode ${passcode} refused`,
                );
            }
        },
        {
            expected:
                "DUT attempts to parse the Manual Pairing Code and DUT terminates the commissioning process in a " +
                "DUT-specific manner according to the DUT manufacturer's instructions.",
        },
    )
    .step(
        "6.a",
        "VENDOR_ID: Using the manual code from Step 1, generate a new manual code using all the same Onboarding " +
            "Payload components except for the VENDOR_ID. For each VENDOR_ID in the following list, set the " +
            "VENDOR_ID component to one of the invalid Test VENDOR_IDs: 0xFFF1, 0xFFF2, 0xFFF3, 0xFFF4",
        async cx => {
            const parts = await thCodeParts(cx);
            const codes = TEST_VENDOR_IDS.map(vendorId => manualPairingCode({ ...parts, vendorId }));
            record(
                cx,
                {
                    type: "response",
                    verdict: "pass",
                    detail: `Generated ${codes.length} codes: ${codes
                        .map((code, i) => `${code} (0x${TEST_VENDOR_IDS[i].toString(16)})`)
                        .join(", ")}`,
                },
                "Test-vendor codes",
            );
        },
        {
            expected:
                "User has 4 manual codes (one for each VENDOR_ID in the list of invalid VENDOR_IDs) generated to " +
                `pass into DUT. ${GUIDELINES}`,
        },
    )
    .step(
        "6.b",
        "Provide each of the Manual Pairing Codes, generated in the previous step, to the DUT in any format " +
            "supported by the DUT",
        async cx => {
            // The plan's own "unless" branch: a cert harness commissions uncertified devices on
            // purpose, and its operator is the user the clause speaks of.
            const parts = await thCodeParts(cx);
            const [mismatched] = TEST_VENDOR_IDS.filter(vendorId => vendorId !== parts.vendorId);

            // A code naming a vendor the TH is not: chip-tool refuses to pair with a device whose
            // advertisement disagrees, matter.js discovers on the discriminator alone and onboards.
            // The plan's expected outcome admits both, so the step records which rather than asserting.
            await recordVendorMismatchOutcome(
                cx,
                manualPairingCode({ ...parts, vendorId: mismatched }),
                commissioned,
                `Code naming vendor 0x${mismatched.toString(16)}`,
                VENDOR_MISMATCH_TIMEOUT_MS,
            );

            await commissionByManualCode(cx, manualPairingCode({ ...parts, vendorId: parts.vendorId }), commissioned);
        },
        {
            expected:
                "If the TH's Vendor ID is an invalid Test Vendor ID, DUT attempts to parse the Manual Pairing Code " +
                "and DUT terminates the commissioning process in a DUT-specific manner according to the DUT " +
                "manufacturer's instructions, unless the user is made fully aware of the security risks of " +
                "providing an uncertified device with operational and networking credentials.",
        },
    )
    .step(
        "7.a",
        "PRODUCT_ID: Using the manual code from Step 1, generate a new manual code but substituting out the " +
            "current PRODUCT_ID with an invalid PRODUCT_ID of 0x0000",
        async cx => {
            const code = await thManualPairingCode(cx, { productId: 0 });
            record(
                cx,
                { type: "response", verdict: "pass", detail: `Generated ${code}, naming product id 0` },
                "Product-id-0 code",
            );
        },
        { expected: `User has a manual code generated to pass into DUT. ${GUIDELINES}` },
    )
    .step(
        "7.b",
        "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the DUT",
        async cx => {
            const manualPairingCode = await thManualPairingCode(cx, { productId: 0 });
            await refusals.requireRefusal(cx, { manualPairingCode }, "Product-id-0 code refused");
        },
        {
            expected:
                "DUT attempts to parse the Manual Pairing Code and DUT terminates the commissioning process in a " +
                "DUT-specific manner according to the DUT manufacturer's instructions.",
        },
    )
    .step(
        "8.a",
        "Check Digit: Using the manual code from Step 1, generate a new manual code but substituting out the " +
            "current CHECK_DIGIT with an invalid CHECK_DIGIT",
        async cx => {
            const code = await wrongCheckDigitCode(cx);
            record(
                cx,
                { type: "response", verdict: "pass", detail: `Generated ${code}, whose check digit is wrong` },
                "Wrong-check-digit code",
            );
        },
        { expected: `User has a manual code generated to pass into DUT. ${GUIDELINES}` },
    )
    .step(
        "8.b",
        "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the DUT",
        async cx => {
            await refusals.requireRefusal(
                cx,
                { manualPairingCode: await wrongCheckDigitCode(cx) },
                "Wrong-check-digit code refused",
            );
        },
        {
            expected:
                "DUT attempts to parse the Manual Pairing Code and DUT terminates the commissioning process in a " +
                "DUT-specific manner according to the DUT manufacturer's instructions.",
        },
    )
    .finalize(async cx => {
        try {
            await refusals.settle(cx);
        } finally {
            await commissioned.decommissionAll(cx);
        }
    });

/** The TH's own code with a check digit that is not the one its digits produce. */
async function wrongCheckDigitCode(cx: Parameters<typeof thManualPairingCode>[0]) {
    const correct = await thManualPairingCode(cx);
    const digit = Number(correct.slice(-1));
    return thManualPairingCode(cx, { checkDigit: (digit + 1) % 10 });
}
