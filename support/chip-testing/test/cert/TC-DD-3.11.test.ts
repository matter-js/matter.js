/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveryCapabilitiesSchema } from "@matter/main/types";
import { certTest } from "@matter/testing";
import {
    commissionByQr,
    CommissioningRefusals,
    ON_NETWORK_ONLY,
    qrPayloadWith,
    recordCommissionable,
    recordDiscriminatorHonored,
    recordGeneratedPayload,
    recordParse,
    recordPayloadOffering,
    STANDARD_FLOW,
    STANDARD_VERSION,
    thQrPayload,
} from "./tc-dd-support.js";
import { CommissionedRefs, runCleanups } from "./tc-support.js";

/**
 * Why the two transport-specific commissioning steps cannot be run rather than skipped.
 *
 * A payload's discovery-capability bitmask is what the commissionee offers, not what the commissioner
 * uses, so driving either step on a controller without that radio commissions over IP and records a
 * pass the transport never earned. The PICS column cannot express it: it answers for the DUT, and the
 * value reaching this gate comes from the TH's own file.
 */
function noRadio(transport: string) {
    return (
        `The DUT-commissioner has no ${transport} radio — a commissioning driven from a payload naming ` +
        `${transport} would proceed over IP and prove nothing about the transport. The PICS value that ` +
        "reaches this step is the TH's, and answers for the TH"
    );
}

const BLE_ONLY = DiscoveryCapabilitiesSchema.encode({ ble: true });
const WIFI_PAF_ONLY = DiscoveryCapabilitiesSchema.encode({ wifiPublicActionFrame: true });

const commissioned = new CommissionedRefs();
const refusals = new CommissioningRefusals();

certTest("TC-DD-3.11", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.QR_COMMISSIONING", "MCORE.DD.STANDARD_COMM_FLOW"],
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
        "1.a",
        "Standard Commissioning Flow: Use a Commissionee with a QR code that has the Custom Flow field set to 0 " +
            "and supports BLE for its Discovery Capability. Ensure the Version bit string follows the current " +
            "Matter spec. documentation.",
        async cx => {
            const source = await thQrPayload(cx.devices.th);
            recordGeneratedPayload(
                cx,
                qrPayloadWith(source, { discoveryCapabilities: BLE_ONLY }),
                {
                    version: STANDARD_VERSION,
                    flowType: STANDARD_FLOW,
                    discoveryCapabilities: BLE_ONLY,
                    unchangedFrom: source,
                },
                "BLE standard-flow payload",
            );
        },
        { pics: "MCORE.DD.DISCOVERY_BLE", expected: "User has a QR code to pass into DUT" },
    )
    .step(
        "1.b",
        "Scan the QR code from the previous step using the DUT.",
        async cx => {
            const payload = qrPayloadWith(await thQrPayload(cx.devices.th), { discoveryCapabilities: BLE_ONLY });
            await recordParse(cx, payload);
            await recordPayloadOffering(cx, payload, "ble");
        },
        {
            // A leg's steps stand or fall together: this one scans "the QR code from the previous
            // step", so it must not run where that step was gated out
            pics: "MCORE.DD.SCAN_QR_CODE & MCORE.DD.DISCOVERY_BLE",
            expected: "Verify the QR code has been scanned successfully.",
        },
    )
    .step(
        "1.c",
        "Using the DUT, parse the TH's QR code and follow any steps needed for the Commissioner/Commissionee to " +
            "complete the commissioning process using BLE",
        async () => {},
        {
            notApplicable: noRadio("BLE"),
            expected: "DUT parses QR code and DUT commissions TH to the Matter network",
        },
    )
    .step(
        "2.a",
        "Standard Commissioning Flow: Use a Commissionee with a QR code that has the Custom Flow field set to 0 " +
            "and supports Wi-Fi PAF for its Discovery Capability. Ensure the Version bit string follows the " +
            "current Matter spec. documentation.",
        async cx => {
            const source = await thQrPayload(cx.devices.th);
            recordGeneratedPayload(
                cx,
                qrPayloadWith(source, { discoveryCapabilities: WIFI_PAF_ONLY }),
                {
                    version: STANDARD_VERSION,
                    flowType: STANDARD_FLOW,
                    discoveryCapabilities: WIFI_PAF_ONLY,
                    unchangedFrom: source,
                },
                "Wi-Fi PAF standard-flow payload",
            );
        },
        { pics: "MCORE.DD.DISCOVERY_PAF", expected: "User has a QR code to pass into DUT" },
    )
    .step(
        "2.b",
        "Scan the QR code from the previous step using the DUT.",
        async cx => {
            const payload = qrPayloadWith(await thQrPayload(cx.devices.th), {
                discoveryCapabilities: WIFI_PAF_ONLY,
            });
            await recordParse(cx, payload);
            await recordPayloadOffering(cx, payload, "wifiPublicActionFrame");
        },
        {
            pics: "MCORE.DD.SCAN_QR_CODE & MCORE.DD.DISCOVERY_PAF",
            expected: "Verify the QR code has been scanned successfully.",
        },
    )
    .step(
        "2.c",
        "Using the DUT, parse the TH's QR code and follow any steps needed for the Commissioner/Commissionee to " +
            "complete the commissioning process using Wi-Fi PAF",
        async () => {},
        {
            notApplicable: noRadio("Wi-Fi PAF"),
            expected: "DUT parses QR code and DUT commissions TH to the Matter network",
        },
    )
    .step(
        "3.a",
        "Standard Commissioning Flow: Use a Commissionee with a QR code that has the Custom Flow field set to 0, " +
            "supports IP Network for its Discovery Capability and is already on the same IP network as the DUT " +
            "commissioner. Ensure the Version bit string follows the current Matter spec. documentation.",
        async cx => {
            const source = await thQrPayload(cx.devices.th);
            recordGeneratedPayload(
                cx,
                qrPayloadWith(source, { discoveryCapabilities: ON_NETWORK_ONLY }),
                {
                    version: STANDARD_VERSION,
                    flowType: STANDARD_FLOW,
                    discoveryCapabilities: ON_NETWORK_ONLY,
                    unchangedFrom: source,
                },
                "OnNetwork standard-flow payload",
            );
        },
        { expected: "User has a QR code to pass into DUT" },
    )
    .step(
        "3.b",
        "Scan the QR code from the previous step using the DUT.",
        async cx => {
            const payload = qrPayloadWith(await thQrPayload(cx.devices.th), {
                discoveryCapabilities: ON_NETWORK_ONLY,
            });
            await recordParse(cx, payload);
            await recordPayloadOffering(cx, payload, "onIpNetwork");
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "3.c",
        "Using the DUT, parse the TH's QR code and follow any steps needed for the Commissioner/Commissionee to " +
            "complete the commissioning process using IP Network",
        async cx => {
            // The capability offering is step 3.b's claim and 3.b is where its PICS gate sits;
            // recording it again here would put a pass for a skipped step's claim in the same bundle.
            // The parse below it is `commissionByQr`'s own, about the code this commissioning used
            const payload = qrPayloadWith(await thQrPayload(cx.devices.th), {
                discoveryCapabilities: ON_NETWORK_ONLY,
            });
            await recordCommissionable(cx);
            await commissionByQr(cx, payload, commissioned);
        },
        { expected: "DUT parses QR code and DUT commissions TH to the Matter network" },
    )
    .finalize(cx =>
        runCleanups(
            () => refusals.settle(cx),
            () => commissioned.decommissionAll(cx),
        ),
    );
