/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import {
    CommissioningRefusals,
    commissionByQr,
    qrPayloadWith,
    qrPayloadWithPrefix,
    onNetworkOnlyPayload,
    recordDiscoveryCapabilityAbsent,
    recordParse,
    thQrPayload,
} from "./tc-dd-support.js";
import { CommissionedRefs, record } from "./tc-support.js";

/** The plan's own substitute for the specification's `000`; any non-zero 3-bit value works. */
const INVALID_VERSION = 0b010;

/** The plan's own substitute for `MT:`. */
const INVALID_PREFIX = "AB:";

/**
 * The trivial passcodes § 5.1.7.1 forbids, transcribed from the plan's step 5.a rather than taken
 * from matter.js's own list, so a divergence between the two shows up as a failing step.
 */
const INVALID_PASSCODES = [
    0, 11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 99999999, 12345678, 87654321,
];

const commissioned = new CommissionedRefs();
const refusals = new CommissioningRefusals();

certTest("TC-DD-3.14", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.QR_COMMISSIONING"],
    app: "all-clusters",
})
    .step(
        1,
        "Locate and scan/read the Commissionee's QR code using DUT",
        async cx => {
            await recordParse(cx, await thQrPayload(cx.devices.th));
        },
        { expected: "Verify the DUT is able to scan/read the QR code" },
    )
    .step(
        "2.a",
        "Version String: Using the QR code from Step 1, generate a new QR code but substituting out the current " +
            "Version String with an invalid Version String (i.e. '010' or any non-zero 3-bit value)",
        async cx => {
            const payload = qrPayloadWith(await thQrPayload(cx.devices.th), { version: INVALID_VERSION });
            record(
                cx,
                {
                    type: "response",
                    verdict: "pass",
                    detail: `Generated ${payload} carrying version ${INVALID_VERSION}`,
                },
                "Invalid-version payload",
            );
        },
        { expected: "User has a QR code generated to pass into DUT." },
    )
    .step(
        "2.b",
        "Scan/read the QR code, generated in the previous step, using the DUT",
        async cx => {
            const payload = qrPayloadWith(await thQrPayload(cx.devices.th), { version: INVALID_VERSION });
            await refusals.requireRefusal(cx, payload, "Invalid-version payload refused");
        },
        {
            expected:
                "DUT parses QR code and DUT terminates the commissioning process in a DUT-specific manner " +
                "according to the DUT manufacturer's instructions.",
        },
    )
    .step(
        "3.a",
        "Using the QR code from Step 1, ensure the TH's Discovery Capability bit string is NOT set to BLE for " +
            "discovery (i.e. set to OnNetwork discovery capability)",
        async cx =>
            recordDiscoveryCapabilityAbsent(cx, await onNetworkOnlyPayload(cx), "ble", "Payload does not offer BLE"),
        {
            pics: "MCORE.DD.DISCOVERY_BLE",
            expected: "User has a QR code generated to pass into DUT.",
        },
    )
    .step(
        "3.b",
        "Scan/read the QR code of the TH device using the DUT",
        async cx => {
            await commissionByQr(cx, await onNetworkOnlyPayload(cx), commissioned);
        },
        {
            pics: "MCORE.DD.DISCOVERY_BLE",
            expected:
                "If TH Commissionee's Discovery Capabilities do not support BLE, ensure that the DUT commissions " +
                "the TH onto the Matter network over a capability that is NOT BLE. In this example, over OnNetwork.",
        },
    )
    .step(
        "4.a",
        "Using the QR code from Step 1, ensure the TH's Discovery Capability bit string is NOT set to Wi-Fi PAF " +
            "for discovery (i.e. set to OnNetwork discovery capability)",
        async cx =>
            recordDiscoveryCapabilityAbsent(
                cx,
                await onNetworkOnlyPayload(cx),
                "wifiPublicActionFrame",
                "Payload does not offer Wi-Fi PAF",
            ),
        {
            pics: "MCORE.DD.DISCOVERY_PAF",
            expected: "User has a QR code generated to pass into DUT.",
        },
    )
    .step(
        "4.b",
        "Scan/read the QR code of the TH device using the DUT",
        async cx => {
            await commissionByQr(cx, await onNetworkOnlyPayload(cx), commissioned);
        },
        {
            pics: "MCORE.DD.DISCOVERY_PAF",
            expected:
                "If TH Commissionee's Discovery Capabilities do not support Wi-Fi PAF, ensure that the DUT " +
                "commissions the TH onto the Matter network over a capability that is NOT Wi-Fi PAF. In this " +
                "example, over OnNetwork.",
        },
    )
    .step(
        "5.a",
        "Passcode: Using the QR code from Step 1, generate a new QR code using all the same Onboarding Payload " +
            "components except for the Passcode. For each passcode in the following list, set the Passcode " +
            "component to one of the invalid Passcodes and generate a new QR code using all the same Onboarding " +
            "Payload components and one Passcode from the list: 00000000, 11111111, 22222222, 33333333, 44444444, " +
            "55555555, 66666666, 77777777, 88888888, 99999999, 12345678, 87654321",
        async cx => {
            const th = await thQrPayload(cx.devices.th);
            const payloads = INVALID_PASSCODES.map(passcode => qrPayloadWith(th, { passcode }));
            record(
                cx,
                {
                    type: "response",
                    verdict: "pass",
                    detail: `Generated ${payloads.length} payloads: ${payloads
                        .map((payload, i) => `${payload} (${INVALID_PASSCODES[i]})`)
                        .join(", ")}`,
                },
                "Invalid-passcode payloads",
            );
        },
        {
            expected:
                "User has 12 QR codes (one for each passcode in the list of invalid passcodes) generated to pass " +
                "into DUT",
        },
    )
    .step(
        "5.b",
        "Scan each of the generated QR codes from the previous step using DUT",
        async cx => {
            const th = await thQrPayload(cx.devices.th);
            for (const passcode of INVALID_PASSCODES) {
                await refusals.requireRefusal(
                    cx,
                    qrPayloadWith(th, { passcode }),
                    `Payload carrying passcode ${passcode} refused`,
                );
            }
        },
        {
            expected:
                "DUT parses QR code and DUT terminates the commissioning process in a DUT-specific manner " +
                "according to the DUT manufacturer's instructions.",
        },
    )
    .step(
        "6.a",
        "Prefix: Using the QR code from Step 1, generate a new QR code but substituting out the current Prefix " +
            "with an invalid Prefix that is not 'MT:' (i.e. Prefix='AB:')",
        async cx => {
            const payload = qrPayloadWithPrefix(await thQrPayload(cx.devices.th), INVALID_PREFIX);
            record(cx, { type: "response", verdict: "pass", detail: `Generated ${payload}` }, "Invalid-prefix payload");
        },
        { expected: "User has a QR code generated to pass into DUT." },
    )
    .step(
        "6.b",
        "Scan/read the QR code, generated in the previous step, using the DUT",
        async cx => {
            const payload = qrPayloadWithPrefix(await thQrPayload(cx.devices.th), INVALID_PREFIX);
            await refusals.requireRefusal(cx, payload, "Invalid-prefix payload refused");
        },
        {
            expected:
                "DUT commissioner does not react successfully to scanning the QR code and DUT terminates the " +
                "commissioning process in a DUT-specific manner according to the DUT manufacturer's instructions.",
        },
    )
    .finalize(async cx => {
        try {
            await refusals.settle(cx);
        } finally {
            await commissioned.decommissionAll(cx);
        }
    });
