/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { colorControlPreconditions, readsColorAttributes, sendsColorCommand } from "./tc-cc-support.js";
import { CommissionedRefs } from "./tc-support.js";

const commissioned = new CommissionedRefs();

certTest("TC-CC-3.4", { plan: "colorcontrol.adoc", pics: ["CC.C"], app: "all-clusters" })
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
        "DUT sends MoveToHue command to TH",
        sendsColorCommand(commissioned, "moveToHue", { hue: 100, direction: 0, transitionTime: 0 }),
        {
            pics: "CC.C.C00.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x00 CommandFields matches MoveToHue command parameters.",
        },
    )
    .step(
        "1b",
        "DUT reads CurrentHue attribute from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "currentHue"),
        {
            pics: "CC.C.C00.Tx & CC.C.A0000",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0000.",
        },
    )
    .step(
        "2a",
        "DUT sends MoveHue command to TH",
        sendsColorCommand(commissioned, "moveHue", { moveMode: 1, rate: 10 }),
        {
            pics: "CC.C.C01.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x01 CommandFields matches MoveHue command parameters.",
        },
    )
    .step(
        "2b",
        "DUT reads CurrentHue attribute (potentially multiple times)",
        readsColorAttributes(commissioned, "currentHue"),
        {
            pics: "CC.C.C01.Tx & CC.C.A0000",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0000.",
        },
    )
    .step(
        "3a",
        "DUT sends StepHue command to TH",
        sendsColorCommand(commissioned, "stepHue", { stepMode: 1, stepSize: 20, transitionTime: 0 }),
        {
            pics: "CC.C.C02.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x02 CommandFields matches StepHue command parameters.",
        },
    )
    .step(
        "3b",
        "DUT reads CurrentHue attribute from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "currentHue"),
        {
            pics: "CC.C.C02.Tx & CC.C.A0000",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0000.",
        },
    )
    .step("4a", "DUT sends StopMoveStep command to TH.", sendsColorCommand(commissioned, "stopMoveStep", {}), {
        pics: "CC.C.C47.Tx",
        expected:
            "TH receives InvokeRequestMessage with CommandID 0x47 CommandFields matches StopMoveStep command parameters.",
    })
    .step(
        "4b",
        "Over TransitionTime, DUT reads CurrentHue attribute from TH.",
        readsColorAttributes(commissioned, "currentHue"),
        {
            pics: "CC.C.C47.Tx & CC.C.A0000",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0000.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
