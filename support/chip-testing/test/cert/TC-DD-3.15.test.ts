/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ManualPairingCodeCodec, VendorId } from "@matter/main/types";
import type { CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    checkGeneratedManualCode,
    commissionByManualCode,
    SHORT_DISCRIMINATOR_SHIFT,
    thCodeParts,
    thPrintedManualCode,
} from "./tc-dd-support.js";
import { CommissionedRefs, record, runCleanups, theTh } from "./tc-support.js";

const commissioned = new CommissionedRefs();

const PROVIDE =
    "Provide the Manual Pairing Code, generated in the previous step, to the DUT in any format supported by the " +
    "DUT. Follow any steps needed for the Commissioner/Commissionee to complete the commissioning process.";

const COMMISSIONED = "DUT parses Manual Pairing Code and DUT commissions TH to the Matter network";

/**
 * A TH on the standard flow prints only the 11-digit code, so the 21-digit form of its identity is
 * rendered by matter.js's own encoder. Step 2.a reads it back with the harness's digit reader, which
 * lays out the fields independently of that encoder.
 */
async function twentyOneDigitCode(cx: CertStepContext) {
    const { discriminator, passcode, vendorId, productId } = await thCodeParts(cx);
    return {
        code: ManualPairingCodeCodec.encode({ discriminator, passcode, vendorId: VendorId(vendorId), productId }),
        vendorId,
        productId,
    };
}

certTest("TC-DD-3.15", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.MANUAL_PC_COMMISSIONING"],
    app: "all-clusters",
})
    .step(
        "1.a",
        "Verify the TH's 11-digit Manual Pairing Code meets the following criteria: VERSION bit string string up to " +
            "date with the current Matter spec. documentation; VID_PID_PRESENT bit string set to 0",
        async cx => {
            const th = theTh(cx);
            record(
                cx,
                checkGeneratedManualCode(await thPrintedManualCode(th), {
                    length: 11,
                    futureFormat: false,
                    vidPidPresent: false,
                    shortDiscriminator: th.commissioning.discriminator >> SHORT_DISCRIMINATOR_SHIFT,
                    passcode: th.commissioning.passcode,
                }),
                "TH's 11-digit code",
            );
        },
        { pics: "MCORE.DD.11_MANUAL_PC", expected: "User has the TH's 11-digit Manual Pairing Code to pass into DUT." },
    )
    .step(
        "1.b",
        PROVIDE,
        async cx => {
            await commissionByManualCode(cx, await thPrintedManualCode(theTh(cx)), commissioned);
        },
        { pics: "MCORE.DD.11_MANUAL_PC", expected: COMMISSIONED },
    )
    .step(
        "2.a",
        "Verify the TH's 21-digit Manual Pairing Code meets the following criteria: A VERSION bit string string " +
            "up-to-date with the current Matter spec. documentation; A VID_PID_PRESENT bit string set to 1; A " +
            'VENDOR_ID present (as defined in section 2.5.2. "Vendor Identifier"); A PRODUCT_ID present (as defined ' +
            'in section 2.5.3. "Product Identifier")',
        async cx => {
            const th = theTh(cx);
            const { code, vendorId, productId } = await twentyOneDigitCode(cx);
            record(
                cx,
                checkGeneratedManualCode(code, {
                    length: 21,
                    futureFormat: false,
                    vidPidPresent: true,
                    shortDiscriminator: th.commissioning.discriminator >> SHORT_DISCRIMINATOR_SHIFT,
                    passcode: th.commissioning.passcode,
                    vendorId,
                    productId,
                }),
                "TH's 21-digit code",
            );
        },
        { pics: "MCORE.DD.21_MANUAL_PC", expected: "User has a Manual Pairing Code to pass into DUT" },
    )
    .step(
        "2.b",
        PROVIDE,
        async cx => {
            await commissionByManualCode(cx, (await twentyOneDigitCode(cx)).code, commissioned);
        },
        { pics: "MCORE.DD.21_MANUAL_PC", expected: COMMISSIONED },
    )
    .finalize(cx => runCleanups(() => commissioned.decommissionAll(cx)));
