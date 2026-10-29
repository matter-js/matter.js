/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { DISCOVERS_COMMISSIONABLE, recordCommissionable, recordDiscoveredTh } from "./tc-dd-support.js";

/**
 * Why the BLE and Wi-Fi PAF legs cannot be run rather than skipped.
 *
 * No controller in this harness has the radio, and no TH announces over it, so a step run here would
 * observe nothing about the transport it names. The plan gates these legs on `MCORE.DD.DISCOVERY_BLE` and
 * `MCORE.DD.DISCOVERY_PAF`, but the value that would reach such a gate is the TH's PICS file, which answers
 * for the TH and not for the DUT.
 */
function noRadio(transport: string) {
    return (
        `The DUT-commissioner has no ${transport} radio, so it cannot scan for an announcement over ${transport}. ` +
        "The PICS value that reaches this step is the TH's, and answers for the TH"
    );
}

certTest("TC-DD-2.2", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER"],
    app: "all-clusters",
})
    .step("1.a", "TH starts matter announcement procedure using BLE transport", async () => {}, {
        notApplicable: noRadio("BLE"),
        expected: "TH must start sending BLE advertisements.",
    })
    .step(
        "1.b",
        "DUT starts BLE scan across all three advertising channels with a sufficient dwell time, interval, and " +
            "overall duration of scan",
        async () => {},
        {
            notApplicable: noRadio("BLE"),
            expected:
                "DUT must find TH and provide onboarding data to for validation. Pass Criteria: DUT is able to " +
                "report the Onboarding payload as set on TH",
        },
    )
    .step("2.a", "DUT starts scan in background using BLE transport", async () => {}, {
        notApplicable: noRadio("BLE"),
    })
    .step("2.b", "TH starts matter announcement using BLE transport", async () => {}, {
        notApplicable: noRadio("BLE"),
        expected: "TH must start sending BLE advertisements.",
    })
    .step("2.c", "(The plan states only the expected outcome for this step.)", async () => {}, {
        notApplicable: noRadio("BLE"),
        expected: "DUT must find TH and provide onboarding data for validation.",
    })
    .step(
        "3.a",
        "TH is configured with the Default Publish Channel to be Channel 6 in 2.4 GHz and a Publish Channel List " +
            "that includes all 20 MHz channels in 2.4 GHz band, Channel 44 and Channel 149 in 5 GHz band, and the " +
            "Commissioner's network operating channel if the operating channel is not a DFS channel.",
        async () => {},
        {
            notApplicable: noRadio("Wi-Fi PAF"),
            expected:
                "TH must start sending Wi-Fi PAF Publish Frames on the Default Publish Channel and the channels on " +
                "the Publish Channel List.",
        },
    )
    .step("3.b", "DUT starts Wi-Fi PAF scan in its configured channel", async () => {}, {
        notApplicable: noRadio("Wi-Fi PAF"),
        expected:
            "DUT must find TH and provide onboarding data to for validation. Pass Criteria: DUT is able to report " +
            "the Onboarding payload as set on TH",
    })
    .step(
        "6",
        "With DUT and TH connected to the same network over IP, DUT performs service discovery using DNS-SD",
        async cx => {
            await recordCommissionable(cx);
            await recordDiscoveredTh(cx);
        },
        {
            controllerCapabilities: DISCOVERS_COMMISSIONABLE,
            expected:
                "DUT must find TH and provide onboarding data for validation. Pass Criteria: DUT is able to report " +
                "the Onboarding payload as set on TH",
        },
    );
