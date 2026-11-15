/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { colorControlPreconditions, readsColorAttributes, sendsColorCommand } from "./tc-cc-support.js";
import { CommissionedRefs } from "./tc-support.js";

const commissioned = new CommissionedRefs();

certTest("TC-CC-7.5", { plan: "colorcontrol.adoc", pics: ["CC.C", "CC.C.F01"], app: "all-clusters" })
    .step(
        "0",
        "Test setup: commission TH to DUT and set TH OnOff to On; the TH supports EnhancedHue (CC.C.F01).",
        colorControlPreconditions(commissioned, ["enhancedHue"]),
        {
            expected:
                "The TH is commissioned onto the DUT's fabric, its OnOff is On, and its ColorControl has the feature the steps below use.",
        },
    )
    .step(
        "1a",
        "DUT sends EnhancedMoveToHue command to TH",
        sendsColorCommand(commissioned, "enhancedMoveToHue", { enhancedHue: 10000, direction: 0, transitionTime: 0 }),
        {
            pics: "CC.C.C40.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x40 CommandFields matches EnhancedMoveToHue command parameters.",
        },
    )
    .step(
        "1b",
        "DUT reads EnhancedCurrentHue attribute from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "enhancedCurrentHue"),
        {
            pics: "CC.C.C40.Tx & CC.C.A4000",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_4000.",
        },
    )
    .step(
        "2a",
        "DUT sends EnhancedMoveHue command to TH",
        sendsColorCommand(commissioned, "enhancedMoveHue", { moveMode: 1, rate: 100 }),
        {
            pics: "CC.C.C41.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x41 CommandFields matches EnhancedMoveHue command parameters.",
        },
    )
    .step(
        "2b",
        "DUT reads EnhancedCurrentHue attribute (potentially multiple times)",
        readsColorAttributes(commissioned, "enhancedCurrentHue"),
        {
            pics: "CC.C.C41.Tx & CC.C.A4000",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_4000.",
        },
    )
    .step(
        "3a",
        "DUT sends EnhancedStepHue command to TH",
        sendsColorCommand(commissioned, "enhancedStepHue", { stepMode: 1, stepSize: 1000, transitionTime: 0 }),
        {
            pics: "CC.C.C42.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x42 CommandFields matches EnhancedStepHue command parameters.",
        },
    )
    .step(
        "3b",
        "DUT reads EnhancedCurrentHue attribute from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "enhancedCurrentHue"),
        {
            pics: "CC.C.C42.Tx & CC.C.A4000",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_4000.",
        },
    )
    .step(
        "4a",
        "DUT sends EnhancedMoveToHueAndSaturation command to TH",
        sendsColorCommand(commissioned, "enhancedMoveToHueAndSaturation", {
            enhancedHue: 20000,
            saturation: 100,
            transitionTime: 0,
        }),
        {
            pics: "CC.C.C43.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x43 CommandFields matches EnhancedMoveToHueAndSaturation command parameters.",
        },
    )
    .step(
        "4b",
        "DUT reads EnhancedCurrentHue and CurrentSaturation attributes from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "enhancedCurrentHue", "currentSaturation"),
        {
            pics: "CC.C.C43.Tx & CC.C.A4000 & CC.C.A0001",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_4000 and 0x0000_0001.",
        },
    )
    .step("5a", "DUT sends StopMoveStep command to TH.", sendsColorCommand(commissioned, "stopMoveStep", {}), {
        pics: "CC.C.C47.Tx",
        expected:
            "TH receives InvokeRequestMessage with CommandID 0x47 CommandFields matches StopMoveStep command parameters.",
    })
    .step(
        "5b",
        "Over TransitionTime, DUT reads EnhancedCurrentHue attribute from TH.",
        readsColorAttributes(commissioned, "enhancedCurrentHue"),
        {
            pics: "CC.C.C47.Tx & CC.C.A4000",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_4000.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
