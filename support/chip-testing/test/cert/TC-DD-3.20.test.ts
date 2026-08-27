/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import {
    commissionByQr,
    recordBackInCommissioningMode,
    recordCommissionable,
    recordParse,
    recordUnpair,
    thQrPayload,
} from "./tc-dd-support.js";
import { CommissionedRefs } from "./tc-support.js";

const commissioned = new CommissionedRefs();

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
            await recordParse(cx, payload);
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
        cx => recordUnpair(cx, commissioned),
        { expected: "Verify the TH is no longer on the Matter network." },
    )
    .step(
        4,
        "Place TH Commissionee back into commissioning mode using the TH manufacturer's means to be discovered " +
            "by the DUT Commissioner",
        cx => recordBackInCommissioningMode(cx, "TH advertising as commissionable again"),
        { expected: "Verify that the TH is advertising and able to be discovered by a commissioner." },
    )
    .step(
        "5.a",
        "Scan TH's QR code using the DUT Commissioner.",
        async cx => {
            await recordParse(cx, await thQrPayload(cx.devices.th));
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "5.b",
        "DUT parses TH's QR code. Follow any steps needed for the Commissioner/Commissionee to complete the " +
            "commissioning process over the TH Commissionee's method of device discovery",
        async cx => {
            const payload = await thQrPayload(cx.devices.th);
            await recordParse(cx, payload);
            await commissionByQr(cx, payload, commissioned);
        },
        {
            expected:
                "DUT parses TH's QR code and DUT commissions TH to the Matter network. Verify that the TH has " +
                "been commissioned onto the Matter network.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
