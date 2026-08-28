/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveryCapabilitiesSchema } from "@matter/main/types";
import type { CertStepContext, CertTestBuilder } from "@matter/testing";
import {
    commissionByQr,
    markTransition,
    ON_NETWORK_ONLY,
    qrPayloadWith,
    recordCommissionable,
    recordGeneratedPayload,
    recordNotCommissioned,
    recordParse,
    recordPayloadOffering,
    STANDARD_VERSION,
    thQrPayload,
} from "./tc-dd-support.js";
import { CommissionedRefs } from "./tc-support.js";

const BLE_ONLY = DiscoveryCapabilitiesSchema.encode({ ble: true });
const WIFI_PAF_ONLY = DiscoveryCapabilitiesSchema.encode({ wifiPublicActionFrame: true });

/**
 * Why a transport-specific commissioning step cannot be run rather than skipped — the same reason
 * TC-DD-3.11 states, and stated per step so the bundle carries it.
 */
function noRadio(transport: string) {
    return (
        `The DUT-commissioner has no ${transport} radio — a commissioning driven from a payload naming ` +
        `${transport} would proceed over IP and prove nothing about the transport. The PICS value that ` +
        "reaches this step is the TH's, and answers for the TH"
    );
}

const NOT_COMMISSIONABLE_UNAVAILABLE =
    "no TH this harness runs can be uncommissioned and not commissionable at the same time — an " +
    "uncommissioned node opens its basic commissioning window at boot, and neither flavor can " +
    "suppress that";

/**
 * TC-DD-3.12 and TC-DD-3.13 are one test case with one field changed, so they are declared from one
 * place: three transport legs of four steps each — generate a payload carrying the flow, scan it,
 * parse it *without* commissioning, then commission.
 *
 * **The flow has to be fabricated, unlike TC-DD-3.11's capability bitmask.** Both chip builds and the
 * matter.js subject publish `flowType` 0, because a device that needs a user action or a
 * manufacturer's steps is not something this harness can produce. So `qrPayloadWith` writes the flow
 * the test case is named for into the TH's own payload, and the scan step reads it back through the
 * DUT's parser — which is what makes the step evidence about the flow rather than about the TH.
 *
 * **What no leg exercises is the transition the flow is named for.** A user-intent or custom flow says
 * the device is not commissionable until someone acts, and `.a`'s precondition says so — but a TH this
 * harness runs advertises as commissionable from boot, so `.d` commissions one that never made that
 * transition. Each leg's `.a` records that gap rather than leaving the bundle to imply otherwise.
 *
 * **Step `.c` carries the interesting claim**, and it is a negative one: the plan says "Verify DUT has
 * parsed the QR code. Verify TH has not been commissioned to the Matter network." Parsing a payload
 * whose flow says "not commissionable yet" must not start a commissioning, and the TH's own log is
 * what states that it did not.
 */
export function defineFlowQrTest(builder: CertTestBuilder, flowType: number, flowName: string): CertTestBuilder {
    const commissioned = new CommissionedRefs();

    const legs = [
        { n: "1", capability: "ble" as const, bitmask: BLE_ONLY, transport: "BLE", pics: "MCORE.DD.DISCOVERY_BLE" },
        {
            n: "2",
            capability: "wifiPublicActionFrame" as const,
            bitmask: WIFI_PAF_ONLY,
            transport: "Wi-Fi PAF",
            pics: "MCORE.DD.DISCOVERY_PAF",
        },
        {
            n: "3",
            capability: "onIpNetwork" as const,
            bitmask: ON_NETWORK_ONLY,
            transport: "IP Network",
            pics: undefined,
        },
    ];

    for (const leg of legs) {
        // Both `.b` and `.c` parse the code themselves, so both need the scan gate
        const scanGate = leg.pics === undefined ? "MCORE.DD.SCAN_QR_CODE" : `MCORE.DD.SCAN_QR_CODE & ${leg.pics}`;

        const payloadFor = async (cx: CertStepContext) =>
            qrPayloadWith(await thQrPayload(cx.devices.th), { discoveryCapabilities: leg.bitmask, flowType });

        builder
            .step(
                `${leg.n}.a`,
                `${flowName} Commissioning Flow: Use a Commissionee with a QR code that has the Custom Flow field ` +
                    `set to ${flowType} and supports ${leg.transport} for its Discovery Capability. Commissionee ` +
                    "is NOT in commissioning mode. Ensure the Version bit string follows the current Matter spec. " +
                    "documentation.",
                async cx => {
                    const source = await thQrPayload(cx.devices.th);
                    recordGeneratedPayload(
                        cx,
                        qrPayloadWith(source, { discoveryCapabilities: leg.bitmask, flowType }),
                        {
                            version: STANDARD_VERSION,
                            flowType,
                            discoveryCapabilities: leg.bitmask,
                            unchangedFrom: source,
                        },
                        `${leg.transport} ${flowName.toLowerCase()}-flow payload`,
                    );

                    cx.recorder.check({
                        type: "network",
                        verdict: "unverified",
                        detail:
                            "TH advertises as commissionable from boot, so the plan's \"Commissionee is NOT in " +
                            'commissioning mode" precondition does not hold and step .d commissions a TH that was ' +
                            "commissionable throughout",
                        accepted: NOT_COMMISSIONABLE_UNAVAILABLE,
                    });
                },
                { pics: leg.pics, expected: "User has a QR code to pass into DUT." },
            )
            .step(
                `${leg.n}.b`,
                "Scan the QR code from the previous step using the DUT.",
                async cx => {
                    const payload = await payloadFor(cx);
                    await recordParse(cx, payload);
                    await recordPayloadOffering(cx, payload, leg.capability, flowType);
                },
                {
                    pics: scanGate,
                    expected: "Verify the QR code has been scanned successfully.",
                },
            )
            .step(
                `${leg.n}.c`,
                "DUT parses QR code.",
                async cx => {
                    const th = cx.devices.th;
                    const since = await markTransition(cx);

                    await recordParse(cx, await payloadFor(cx));

                    // The plan's second sentence, and the one worth having: a flow that says the
                    // device is not commissionable yet must not have the DUT commission it merely
                    // because it read the code.
                    await recordNotCommissioned(cx, th, since, "TH was not commissioned by the parse");
                },
                {
                    pics: scanGate,
                    expected:
                        "Verify DUT has parsed the QR code. Verify TH has not been commissioned to the Matter " +
                        "network.",
                },
            )
            .step(
                `${leg.n}.d`,
                "User should follow any TH-specific steps for putting the TH Commissionee device into " +
                    `commissioning mode and to complete the commissioning process using ${leg.transport}.`,
                leg.capability === "onIpNetwork"
                    ? async cx => {
                          await recordCommissionable(cx);
                          await commissionByQr(cx, await payloadFor(cx), commissioned);
                      }
                    : async () => {},
                leg.capability === "onIpNetwork"
                    ? { expected: "DUT commissions TH to the Matter network." }
                    : { notApplicable: noRadio(leg.transport), expected: "DUT commissions TH to the Matter network." },
            );
    }

    return builder.finalize(cx => commissioned.decommissionAll(cx));
}
