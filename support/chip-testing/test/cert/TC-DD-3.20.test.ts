/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { certTest } from "@matter/testing";
import type { TransitionMark } from "./tc-dd-support.js";
import {
    commissionByQr,
    CommissioningRefusals,
    recordBackInCommissioningMode,
    recordCommissionable,
    recordDiscriminatorHonored,
    recordParse,
    recordUnpair,
    thQrPayload,
} from "./tc-dd-support.js";
import { CommissionedRefs, runCleanups } from "./tc-support.js";

const commissioned = new CommissionedRefs();
const refusals = new CommissioningRefusals();

// Step 4's claim is about a transition step 3 caused, so its evidence has to start before that
// removal. A mark taken in step 4 can already be past the device's own announcement, and the network
// still holds the advertisement the TH published before it was ever commissioned.
let unpairedAt: TransitionMark | undefined;

function unpaired(): TransitionMark {
    if (unpairedAt === undefined) {
        throw new InternalError("Step ran before the TH was unpaired");
    }
    return unpairedAt;
}

certTest("TC-DD-3.20", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.QR_COMMISSIONING"],
    app: "all-clusters",
})
    .step(
        1,
        "Place TH into commissioning mode using the TH manufacturer's means to be discovered by the DUT Commissioner",
        recordCommissionable,
        { expected: "Verify that the TH is advertising and able to be discovered by a commissioner." },
    )
    .step(
        "2.a",
        "Scan TH's QR code using the DUT Commissioner.",
        async cx => {
            await recordParse(cx, await thQrPayload(cx.devices.th));
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "2.b",
        "DUT parses TH's QR code. Follow any steps needed for the Commissioner/Commissionee to complete the " +
            "commissioning process over the TH Commissionee's method of device discovery",
        async cx => {
            const payload = await thQrPayload(cx.devices.th);
            await recordDiscriminatorHonored(cx, payload, refusals);
            await commissionByQr(cx, payload, commissioned);
        },
        {
            expected:
                "DUT parses TH's QR code and DUT commissions TH to the Matter network. Verify that the TH has " +
                "been commissioned onto the Matter network.",
        },
    )
    .step(
        3,
        "Using DUT Commissioner, unpair the TH Commissionee from the Matter network.",
        async cx => {
            unpairedAt = await recordUnpair(cx, commissioned);
        },
        { expected: "Verify the TH is no longer on the Matter network." },
    )
    .step(
        4,
        "Place TH Commissionee back into commissioning mode using the TH manufacturer's means to be discovered " +
            "by the DUT Commissioner",
        cx => recordBackInCommissioningMode(cx, { since: unpaired() }),
        { expected: "Verify that the TH is advertising and able to be discovered by a commissioner." },
    )
    .step(
        "5.a",
        "Scan TH's QR code using the DUT Commissioner.",
        async cx => {
            await recordParse(cx, await thQrPayload(cx.devices.th, unpaired()));
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "5.b",
        "DUT parses TH's QR code. Follow any steps needed for the Commissioner/Commissionee to complete the " +
            "commissioning process over the TH Commissionee's method of device discovery",
        async cx => {
            // Read after the unpair, so a chip TH restarted in step 4 is scanned from its own
            // payload rather than from the one the generation that went down had printed
            await commissionByQr(cx, await thQrPayload(cx.devices.th, unpaired()), commissioned);
        },
        {
            expected:
                "DUT parses TH's QR code and DUT commissions TH to the Matter network. Verify that the TH has " +
                "been commissioned onto the Matter network.",
        },
    )
    .finalize(cx =>
        runCleanups(
            () => refusals.settle(cx),
            () => commissioned.decommissionAll(cx),
        ),
    );
