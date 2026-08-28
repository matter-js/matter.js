/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError } from "@matter/main";
import type { QrCodeData } from "@matter/main/types";
import { QrPairingCodeCodec } from "@matter/main/types";
import { certTest } from "@matter/testing";
import {
    commissionByQr,
    CommissioningRefusals,
    recordDiscriminatorHonored,
    recordParse,
    thQrPayload,
} from "./tc-dd-support.js";
import { CommissionedRefs, runCleanups } from "./tc-support.js";

/**
 * The plan's own example TLV payload (§ 5.1.5): an anonymous structure carrying serial number
 * "1234567890" under context tag 0x00.
 */
const PLAN_TLV_DATA = Bytes.fromHex("152c000a3132333435363738393018");

/** The plan's step 4 payload length, counted over the whole string including its `MT:` prefix. */
const LARGE_QR_CODE_LENGTH = 255;

/**
 * A UTF-8 string of this length under a manufacturer-specific tag fills the payload to exactly
 * {@link LARGE_QR_CODE_LENGTH}: 5 bytes of TLV framing plus the fixed 11-byte structure is 151 bytes,
 * which base38 renders as 252 characters.
 */
const LARGE_TLV_STRING_LENGTH = 135;

const commissioned = new CommissionedRefs();
const refusals = new CommissioningRefusals();

function decodeSingle(payload: string): QrCodeData {
    const payloads = QrPairingCodeCodec.decode(payload);
    if (payloads.length !== 1) {
        throw new InternalError(`Expected one onboarding payload, decoded ${payloads.length}`);
    }
    return payloads[0];
}

/** `payload` with `tlvData` appended, which the plan expects the DUT to parse and may then ignore. */
function withTlvData(payload: string, tlvData: Bytes): string {
    return QrPairingCodeCodec.encode([{ ...decodeSingle(payload), tlvData }]);
}

/** An anonymous structure holding one UTF-8 string, 1-octet length, under manufacturer tag 0x82. */
function largeTlvData(): Bytes {
    return Bytes.concat(
        Bytes.fromHex(`152c82${LARGE_TLV_STRING_LENGTH.toString(16)}`),
        Bytes.fromString("1".repeat(LARGE_TLV_STRING_LENGTH)),
        Bytes.fromHex("18"),
    );
}

function largeQrPayload(payload: string): string {
    const large = withTlvData(payload, largeTlvData());
    if (large.length !== LARGE_QR_CODE_LENGTH) {
        throw new InternalError(
            `Large onboarding payload is ${large.length} characters, not the plan's ${LARGE_QR_CODE_LENGTH}`,
        );
    }
    return large;
}

certTest("TC-DD-1.8", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.QR_COMMISSIONING"],
    app: "all-clusters",
})
    .step(
        "0",
        "Precondition: the DUT is a commissioner that uses the discriminator its onboarding code names.",
        cx => recordDiscriminatorHonored(cx, refusals),
        {
            expected:
                "DUT does not commission the TH from a code naming a discriminator no device advertises. " +
                "Every later step's commissioning rests on this.",
        },
    )
    .step(
        1,
        "Scan the TH Device's QR code using DUT",
        async cx => {
            await recordParse(cx, await thQrPayload(cx.devices.th));
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        2,
        "Using the DUT, parse the TH's QR code to onboard the TH Device onto the Matter network.",
        async cx => {
            const payload = await thQrPayload(cx.devices.th);
            await commissionByQr(cx, payload, commissioned);
        },
        { expected: "Verify the TH's QR code was parsed successfully by the DUT" },
    )
    .step(
        "3.a",
        "Scan the TH Device's QR code (that includes the additional TLV data) using DUT.",
        async cx => {
            await recordParse(cx, withTlvData(await thQrPayload(cx.devices.th), PLAN_TLV_DATA));
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "3.b",
        "Using the DUT, parse the TH's QR code to onboard the TH Device onto the Matter network.",
        async cx => {
            const payload = withTlvData(await thQrPayload(cx.devices.th), PLAN_TLV_DATA);
            await commissionByQr(cx, payload, commissioned);
        },
        {
            expected:
                "Verify the TH's QR code with the appended TLV data was parsed successfully by the DUT (where the " +
                "DUT may ignore the TLV contents)",
        },
    )
    .step(
        "4.a",
        `Scan the TH Device's QR code using the DUT. The number of alphanumeric characters in the QR code is ` +
            `${LARGE_QR_CODE_LENGTH} characters.`,
        async cx => {
            await recordParse(cx, largeQrPayload(await thQrPayload(cx.devices.th)));
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "4.b",
        "Using the DUT, parse the TH's QR code to onboard the TH Device onto the Matter network.",
        async cx => {
            const payload = largeQrPayload(await thQrPayload(cx.devices.th));
            await commissionByQr(cx, payload, commissioned);
        },
        {
            expected:
                "Verify the TH's QR code with the appended TLV data was parsed successfully by the DUT (where the " +
                "DUT may ignore the TLV contents)",
        },
    )
    .finalize(cx =>
        runCleanups(
            () => refusals.settle(cx),
            () => commissioned.decommissionAll(cx),
        ),
    );
