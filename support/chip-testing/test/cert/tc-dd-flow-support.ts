/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveryCapabilitiesSchema } from "@matter/main/types";
import type { CertStepContext, CertTestBuilder } from "@matter/testing";
import {
    commissionByQr,
    CommissioningRefusals,
    flowTitle,
    ON_NETWORK_ONLY,
    PARSES_PAYLOAD,
    qrPayloadWith,
    recordDiscriminatorHonored,
    recordGeneratedPayload,
    recordNotCommissionable,
    recordParse,
    recordUserIntentCommissioningStart,
    STANDARD_VERSION,
    thQrPayload,
} from "./tc-dd-support.js";
import { CommissionedRefs, runCleanups, theTh, withChecks } from "./tc-support.js";

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

/**
 * Starts the TH without a commissioning window, which it opens only on `userIntentCommissioningStart`. Both test
 * cases pass flow 1, TC-DD-3.13 included: chip's apps leave the window closed for flow 1 alone, and the flow the
 * DUT reads is written into the payload anyway.
 */
export const USER_INTENT_TH_ARGS = ["--custom-flow", "1"];

/**
 * TC-DD-3.12 and TC-DD-3.13 are one test case with one field changed, so they are declared from one
 * place: three transport legs of four steps each — generate a payload carrying the flow, scan it,
 * parse it *without* commissioning, then commission.
 *
 * **The test writes the flow into the payload, unlike TC-DD-3.11's capability bitmask.** No TH flavor
 * offers a custom flow with its own vendor steps. So `qrPayloadWith` writes the flow the test case is
 * named for into the TH's own payload, and the scan step reads it back through the DUT's parser —
 * which is what makes the step evidence about the flow rather than about the TH.
 *
 * **The TH is not commissionable until the user acts, as the flow says.** A case starts it with
 * {@link USER_INTENT_TH_ARGS}, so each leg's `.a` checks that it has not advertised in commissioning mode.
 * The IP leg's `.d` is the user action: it opens the TH's window, checks the TH advertises, and only
 * then commissions. The check that the DUT honours the discriminator runs there too, because it needs a
 * TH that advertises.
 *
 * **`.c` records the parse and the leg's payload offering, as `.b` does, not the plan's second
 * sentence.** The plan also asks to verify the TH
 * was not commissioned, but the only thing `.c` asks of the DUT is `parseQrPayload`, which decodes
 * locally on both controllers and reaches no network — so a check that the TH was not commissioned by
 * it examines a window nothing could have written to, and would record a pass for a claim nobody
 * tested. Whether a commissioner acts on a flow that says "not commissionable yet" is only observable
 * where it is given the chance to commission, which is `.d`.
 */
export function defineFlowQrTest(builder: CertTestBuilder, flowType: number): CertTestBuilder {
    const title = flowTitle(flowType);
    const commissioned = new CommissionedRefs();
    const refusals = new CommissioningRefusals();

    const legs = [
        {
            n: "1",
            capability: "ble" as const,
            bitmask: BLE_ONLY,
            transport: "BLE",
            pics: "MCORE.DD.DISCOVERY_BLE",
        },
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
            qrPayloadWith(await thQrPayload(theTh(cx)), { discoveryCapabilities: leg.bitmask, flowType });

        builder
            .step(
                `${leg.n}.a`,
                `${title} Commissioning Flow: Use a Commissionee with a QR code that has the Custom Flow field ` +
                    `set to ${flowType} and supports ${leg.transport} for its Discovery Capability. Commissionee ` +
                    "is NOT in commissioning mode. Ensure the Version bit string follows the current Matter spec. " +
                    "documentation.",
                async cx => {
                    const source = await thQrPayload(theTh(cx));
                    recordGeneratedPayload(
                        cx,
                        qrPayloadWith(source, { discoveryCapabilities: leg.bitmask, flowType }),
                        {
                            version: STANDARD_VERSION,
                            flowType,
                            discoveryCapabilities: leg.bitmask,
                            unchangedFrom: source,
                        },
                        `${leg.transport} ${title.toLowerCase()}-flow payload`,
                    );

                    await recordNotCommissionable(cx);
                },
                { pics: leg.pics, expected: "User has a QR code to pass into DUT." },
            )
            .step(
                `${leg.n}.b`,
                "Scan the QR code from the previous step using the DUT.",
                async cx => {
                    const payload = await payloadFor(cx);
                    await recordParse(cx, payload, { offering: { capability: leg.capability, flowType } });
                },
                {
                    controllerCapabilities: PARSES_PAYLOAD,
                    pics: scanGate,
                    expected: "Verify the QR code has been scanned successfully.",
                },
            )
            .step(
                `${leg.n}.c`,
                "DUT parses QR code.",
                async cx => {
                    const payload = await payloadFor(cx);
                    await recordParse(cx, payload, { offering: { capability: leg.capability, flowType } });
                },
                {
                    controllerCapabilities: PARSES_PAYLOAD,
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
                          await recordUserIntentCommissioningStart(cx);
                          await recordDiscriminatorHonored(cx, refusals);
                          const payload = await payloadFor(cx);
                          await withChecks(cx, checks => commissionByQr(cx, payload, commissioned, checks));
                      }
                    : async () => {},
                leg.capability === "onIpNetwork"
                    ? {
                          expected:
                              "DUT commissions TH to the Matter network. Before that, the DUT does not commission " +
                              "the TH from a code naming a discriminator no device advertises.",
                      }
                    : { notApplicable: noRadio(leg.transport), expected: "DUT commissions TH to the Matter network." },
            );
    }

    return builder.finalize(cx =>
        runCleanups(
            () => refusals.settle(cx),
            () => commissioned.decommissionAll(cx),
        ),
    );
}
