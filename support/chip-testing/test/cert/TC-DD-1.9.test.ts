/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import {
    ABSENT_DEVICE_GIVE_UP,
    ABSENT_DEVICE_WAIT,
    commissionByManualCode,
    CommissioningRefusals,
    DISCRIMINATOR_MSB,
    manualPairingCode,
    thElevenDigitCodeParts,
    thPrintedManualCode,
} from "./tc-dd-support.js";
import { CommissionedRefs, runCleanups, theTh, withChecks } from "./tc-support.js";

const commissioned = new CommissionedRefs();
const refusals = new CommissioningRefusals();

certTest("TC-DD-1.9", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.MANUAL_PC_COMMISSIONING"],
    app: "all-clusters",
})
    .step(
        "0",
        "Precondition: the DUT is a commissioner that uses the discriminator a Manual Pairing Code names.",
        async cx => {
            const parts = thElevenDigitCodeParts(cx);
            const code = manualPairingCode({ ...parts, discriminator: parts.discriminator ^ DISCRIMINATOR_MSB });
            await refusals.requireGiveUp(
                cx,
                { manualPairingCode: code, giveUpAfterMs: ABSENT_DEVICE_GIVE_UP },
                "No device commissioned from a manual code naming a discriminator no device advertises",
                ABSENT_DEVICE_WAIT,
            );
        },
        {
            expected:
                "DUT does not commission the TH from the TH's Manual Pairing Code with a short discriminator no " +
                "device advertises. Step 1's commissioning rests on this.",
        },
    )
    .step(
        1,
        "Provide the 11-digit/21-digit Manual Pairing Code from the TH Device in text, speech or any format supported " +
            "by DUT",
        async cx => {
            const code = await thPrintedManualCode(theTh(cx));
            await withChecks(cx, checks => commissionByManualCode(cx, code, commissioned, checks));
        },
        {
            expected:
                "Verify that the Manual Pairing Code can be provided to DUT and parsed to onboard the device onto the " +
                "Matter network.",
        },
    )
    .finalize(cx =>
        runCleanups(
            () => refusals.settle(cx),
            () => commissioned.decommissionAll(cx),
        ),
    );
