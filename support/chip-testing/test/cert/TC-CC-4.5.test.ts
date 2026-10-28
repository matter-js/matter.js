/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { colorControlPreconditions, readsColorAttributes, sendsColorCommand } from "./tc-cc-support.js";
import { CommissionedRefs } from "./tc-support.js";

const commissioned = new CommissionedRefs();

certTest("TC-CC-4.5", { plan: "colorcontrol.adoc", pics: ["CC.C"], app: "all-clusters" })
    .step(
        "0",
        "Test setup: commission TH to DUT and set TH OnOff to On; the TH supports HueSaturation (CC.C.F00).",
        colorControlPreconditions(commissioned, ["hueSaturation"]),
        {
            expected:
                "The TH is commissioned onto the DUT's fabric, its OnOff is On, and its ColorControl has the feature the steps below use.",
        },
    )
    .step(
        "1a",
        "DUT sends MoveToSaturation command to TH",
        sendsColorCommand(commissioned, "moveToSaturation", { saturation: 150, transitionTime: 0 }),
        {
            pics: "CC.C.C03.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x03 CommandFields matches MoveToSaturation command parameters.",
        },
    )
    .step(
        "1b",
        "DUT reads CurrentSaturation attribute from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "currentSaturation"),
        {
            pics: "CC.C.C03.Tx & CC.C.A0001",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0001.",
        },
    )
    .step(
        "2a",
        "DUT sends MoveSaturation command to TH",
        sendsColorCommand(commissioned, "moveSaturation", { moveMode: 1, rate: 10 }),
        {
            pics: "CC.C.C04.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x04 CommandFields matches MoveSaturation command parameters.",
        },
    )
    .step(
        "2b",
        "DUT reads CurrentSaturation attribute (potentially multiple times)",
        readsColorAttributes(commissioned, "currentSaturation"),
        {
            pics: "CC.C.C04.Tx & CC.C.A0001",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0001.",
        },
    )
    .step(
        "3a",
        "DUT sends StepSaturation command to TH",
        sendsColorCommand(commissioned, "stepSaturation", { stepMode: 1, stepSize: 20, transitionTime: 0 }),
        {
            pics: "CC.C.C05.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x05 CommandFields matches StepSaturation command parameters.",
        },
    )
    .step(
        "3b",
        "DUT reads CurrentSaturation attribute from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "currentSaturation"),
        {
            pics: "CC.C.C05.Tx & CC.C.A0001",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0001.",
        },
    )
    .step(
        "4a",
        "DUT sends MoveToHueAndSaturation command to TH",
        sendsColorCommand(commissioned, "moveToHueAndSaturation", { hue: 50, saturation: 100, transitionTime: 0 }),
        {
            pics: "CC.C.C06.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x06 CommandFields matches MoveToHueAndSaturation command parameters.",
        },
    )
    .step(
        "4b",
        "DUT reads CurrentHue and CurrentSaturation attributes from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "currentHue", "currentSaturation"),
        {
            pics: "CC.C.C06.Tx & CC.C.A0000 & CC.C.A0001",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0000 and 0x0000_0001.",
        },
    )
    .step("5a", "DUT sends StopMoveStep command to TH.", sendsColorCommand(commissioned, "stopMoveStep", {}), {
        pics: "CC.C.C47.Tx",
        expected:
            "TH receives InvokeRequestMessage with CommandID 0x47 CommandFields matches StopMoveStep command parameters.",
    })
    .step(
        "5b",
        "Over TransitionTime, DUT reads CurrentSaturation attribute from TH.",
        readsColorAttributes(commissioned, "currentSaturation"),
        {
            pics: "CC.C.C47.Tx & CC.C.A0001",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0001.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
