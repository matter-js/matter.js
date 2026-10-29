/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { colorControlPreconditions, sendsColorCommand } from "./tc-cc-support.js";
import { CommissionedRefs } from "./tc-support.js";

const commissioned = new CommissionedRefs();

certTest("TC-CC-5.4", { plan: "colorcontrol.adoc", pics: ["CC.C", "CC.C.F03"], app: "all-clusters" })
    .step(
        "0",
        "Test setup: commission TH to DUT and set TH OnOff to On; the TH supports XY (CC.C.F03).",
        colorControlPreconditions(commissioned, ["xy"]),
        {
            expected:
                "The TH is commissioned onto the DUT's fabric, its OnOff is On, and its ColorControl has the feature the steps below use.",
        },
    )
    .step(
        "1",
        "DUT sends MoveToColor command to TH",
        sendsColorCommand(commissioned, "moveToColor", { colorX: 20000, colorY: 20000, transitionTime: 0 }),
        {
            pics: "CC.C.C07.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x07 CommandFields matches MoveToColor command parameters.",
        },
    )
    .step(
        "2",
        "DUT sends MoveColor command to TH",
        sendsColorCommand(commissioned, "moveColor", { rateX: -100, rateY: 100 }),
        {
            pics: "CC.C.C08.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x08 CommandFields matches MoveColor command parameters.",
        },
    )
    .step(
        "3",
        "DUT sends StepColor command to TH",
        sendsColorCommand(commissioned, "stepColor", { stepX: 1000, stepY: -1000, transitionTime: 0 }),
        {
            pics: "CC.C.C09.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x09 CommandFields matches StepColor command parameters.",
        },
    )
    .step("4", "DUT sends StopMoveStep command to TH.", sendsColorCommand(commissioned, "stopMoveStep", {}), {
        pics: "CC.C.C47.Tx",
        expected:
            "TH receives InvokeRequestMessage with CommandID 0x47 CommandFields matches StopMoveStep command parameters.",
    })
    .finalize(cx => commissioned.decommissionAll(cx));
