/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/main";
import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    checkGeneratedManualCode,
    CommissioningRefusals,
    INVALID_PASSCODES,
    manualPairingCode,
    recordGeneratedManualCode,
    recordManualParse,
    recordVendorOutcome,
    SHORT_DISCRIMINATOR_SHIFT,
    TEST_VENDOR_IDS,
    thCodeParts,
    thManualPairingCode,
} from "./tc-dd-support.js";
import { CertCheckFailedError, CommissionedRefs, recordAll, runCleanups } from "./tc-support.js";

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
const GIVE_UP_AFTER = Seconds(20);

/** Step 6's per-vendor attempt, bounded the same way step 4's absent device is. */
const VENDOR_OUTCOME_TIMEOUT = Seconds(20);
const NO_COMMISSIONEE_TIMEOUT = Seconds(90);

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
            // The marker occupies the whole first digit (§ 5.1.4.1.2), so VID_PID_PRESENT and the
            // discriminator's two MSBs cannot survive alongside it; the passcode has to, or step 2.b
            // would be refusing the code for the wrong reason
            const parts = await thCodeParts(cx);
            recordGeneratedManualCode(
                cx,
                manualPairingCode({ ...parts, futureFormat: true }),
                {
                    futureFormat: true,
                    vidPidPresent: false,
                    shortDiscriminator: (parts.discriminator >> SHORT_DISCRIMINATOR_SHIFT) & 0x03,
                    unchangedFrom: manualPairingCode(parts),
                },
                "Reserved-version code",
            );
        },
        { expected: `User has a manual code generated to pass into DUT. ${GUIDELINES}` },
    )
    .step(
        "2.b",
        "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the DUT",
        async cx => {
            const code = await thManualPairingCode(cx, { futureFormat: true });
            await refusals.requireRefusal(cx, { manualPairingCode: code }, "Reserved-version code refused");
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
            const parts = await thCodeParts(cx);
            recordGeneratedManualCode(
                cx,
                manualPairingCode({ ...parts, vidPidPresent: false }),
                { vidPidPresent: false, unchangedFrom: manualPairingCode(parts) },
                "Header/length mismatch code",
            );
        },
        { expected: `User has a manual code generated to pass into DUT. ${GUIDELINES}` },
    )
    .step(
        "3.b",
        "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the DUT",
        async cx => {
            const code = await thManualPairingCode(cx, { vidPidPresent: false });
            await refusals.requireRefusal(cx, { manualPairingCode: code }, "Header/length mismatch refused");
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
            const parts = await thCodeParts(cx);
            const discriminator = parts.discriminator ^ DISCRIMINATOR_MSB;
            recordGeneratedManualCode(
                cx,
                manualPairingCode({ ...parts, discriminator }),
                {
                    shortDiscriminator: discriminator >> SHORT_DISCRIMINATOR_SHIFT,
                    differsFrom: manualPairingCode(parts),
                    unchangedFrom: manualPairingCode(parts),
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
            const code = await thManualPairingCode(cx, {
                discriminator: cx.devices.th.commissioning.discriminator ^ DISCRIMINATOR_MSB,
            });
            await refusals.requireNoCommissioning(
                cx,
                { manualPairingCode: code, giveUpAfterMs: GIVE_UP_AFTER },
                "No device commissioned from the wrong discriminator",
                NO_COMMISSIONEE_TIMEOUT,
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
            const source = manualPairingCode(parts);
            recordAll(
                cx,
                INVALID_PASSCODES.map(passcode => ({
                    check: () =>
                        checkGeneratedManualCode(manualPairingCode({ ...parts, passcode }), {
                            passcode,
                            unchangedFrom: source,
                        }),
                    what: `Code carrying passcode ${passcode}`,
                })),
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
            const source = manualPairingCode(parts);
            recordAll(
                cx,
                TEST_VENDOR_IDS.map(vendorId => ({
                    check: () =>
                        checkGeneratedManualCode(manualPairingCode({ ...parts, vendorId }), {
                            vendorId,
                            unchangedFrom: source,
                        }),
                    what: `Code naming vendor 0x${vendorId.toString(16)}`,
                })),
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
            // purpose, and its operator is the user the clause speaks of. Both controllers pass over a
            // device whose advertised vendor id the code does not name, and one of the four codes names
            // the TH's own, so the step records which outcome each code produced rather than asserting
            // one (see recordVendorOutcome).
            const parts = await thCodeParts(cx);
            const failures = new Array<CertCheckFailedError>();
            for (const vendorId of TEST_VENDOR_IDS) {
                try {
                    await recordVendorOutcome(
                        cx,
                        manualPairingCode({ ...parts, vendorId }),
                        commissioned,
                        refusals,
                        `Code naming vendor 0x${vendorId.toString(16)}`,
                        VENDOR_OUTCOME_TIMEOUT,
                        { vendorId, thVendorId: parts.vendorId },
                    );
                } catch (e) {
                    // The plan hands over every code, so one the DUT answered unexpectedly must not
                    // leave the rest unrecorded — the step fails once, after all four are in the bundle
                    if (!(e instanceof CertCheckFailedError)) {
                        throw e;
                    }
                    failures.push(e);
                }
            }
            if (failures.length) {
                throw new CertCheckFailedError(
                    `${failures.length} of ${TEST_VENDOR_IDS.length} codes: ${failures.map(e => e.message).join("; ")}`,
                );
            }
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
            const parts = await thCodeParts(cx);
            recordGeneratedManualCode(
                cx,
                manualPairingCode({ ...parts, productId: 0 }),
                { productId: 0, unchangedFrom: manualPairingCode(parts) },
                "Product-id-0 code",
            );
        },
        { expected: `User has a manual code generated to pass into DUT. ${GUIDELINES}` },
    )
    .step(
        "7.b",
        "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the DUT",
        async cx => {
            const code = await thManualPairingCode(cx, { productId: 0 });
            await refusals.requireRefusal(cx, { manualPairingCode: code }, "Product-id-0 code refused");
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
            const { correct, wrong } = await checkDigitCodes(cx);
            recordGeneratedManualCode(
                cx,
                wrong,
                { checkDigitCorrect: false, differsFrom: correct, unchangedFrom: correct },
                "Wrong-check-digit code",
            );
        },
        { expected: `User has a manual code generated to pass into DUT. ${GUIDELINES}` },
    )
    .step(
        "8.b",
        "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the DUT",
        async cx => {
            const { wrong } = await checkDigitCodes(cx);
            await refusals.requireRefusal(cx, { manualPairingCode: wrong }, "Wrong-check-digit code refused");
        },
        {
            expected:
                "DUT attempts to parse the Manual Pairing Code and DUT terminates the commissioning process in a " +
                "DUT-specific manner according to the DUT manufacturer's instructions.",
        },
    )
    .finalize(cx =>
        runCleanups(
            () => refusals.settle(cx),
            () => commissioned.decommissionAll(cx),
        ),
    );

async function checkDigitCodes(cx: CertStepContext): Promise<{ correct: string; wrong: string }> {
    const parts = await thCodeParts(cx);
    const correct = manualPairingCode(parts);
    const digit = Number(correct.slice(-1));

    return { correct, wrong: manualPairingCode({ ...parts, checkDigit: (digit + 1) % 10 }) };
}
