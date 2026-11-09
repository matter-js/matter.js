/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/main";
import { certTest } from "@matter/testing";
import {
    colorControlPreconditions,
    readColorAttribute,
    readsColorAttributes,
    sendsColorCommand,
} from "./tc-cc-support.js";
import type { RecordedCheck } from "./tc-support.js";
import { CommissionedRefs, recordAll, sleepUntil } from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** The plan's step 2e: a read every 5 seconds over the next 30 seconds, the last one at 30 seconds. */
const HUE_READS = 6;
const HUE_READ_INTERVAL = Seconds(5);

/** ColorLoopSet: update every loop parameter, start the loop from EnhancedCurrentHue, count up, 30 s per loop. */
const COLOR_LOOP = {
    updateFlags: { updateAction: true, updateDirection: true, updateTime: true, updateStartHue: true },
    action: 2,
    direction: 1,
    time: 30,
    startHue: 0,
};

certTest("TC-CC-9.4", { plan: "colorcontrol.adoc", pics: ["CC.C", "CC.C.F02", "CC.C.F01"], app: "all-clusters" })
    .step(
        "0",
        "Test setup: commission TH to DUT and set TH OnOff to On; the TH supports ColorLoop (CC.C.F02) and " +
            "EnhancedHue (CC.C.F01).",
        colorControlPreconditions(commissioned, ["colorLoop", "enhancedHue"]),
        {
            expected:
                "The TH is commissioned onto the DUT's fabric, its OnOff is On, and its ColorControl has the features " +
                "the steps below use.",
        },
    )
    .step(1, "DUT sends ColorLoopSet command to TH.", sendsColorCommand(commissioned, "colorLoopSet", COLOR_LOOP), {
        pics: "CC.C.C44.Tx",
        expected:
            "TH receives InvokeRequestMessage with CommandID 0x44 CommandFields matches ColorLoopSet command parameters.",
    })
    .step("2a", "DUT read ColorLoopActive attribute from TH.", readsColorAttributes(commissioned, "colorLoopActive"), {
        pics: "CC.C.A4002",
        expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_4002.",
    })
    .step(
        "2b",
        "DUT read ColorLoopDirection attribute from TH.",
        readsColorAttributes(commissioned, "colorLoopDirection"),
        { pics: "CC.C.A4003", expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_4003." },
    )
    .step("2c", "DUT read ColorLoopTime attribute from TH.", readsColorAttributes(commissioned, "colorLoopTime"), {
        pics: "CC.C.A4004",
        expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_4004.",
    })
    .step(
        "2d",
        "DUT read ColorLoopStartEnhancedHue attribute from TH.",
        readsColorAttributes(commissioned, "colorLoopStartEnhancedHue"),
        { pics: "CC.C.A4005", expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_4005." },
    )
    .step(
        "2e",
        "Over next 30 seconds, at 5 seconds interval, DUT read EnhancedCurrentHue attribute from TH.",
        commissioned.withRef("dut", async (cx, ref) => {
            const checks = new Array<RecordedCheck>();
            const start = performance.now();
            for (let read = 1; read <= HUE_READS; read++) {
                await sleepUntil("EnhancedCurrentHue read interval", start + read * HUE_READ_INTERVAL);
                checks.push(...(await readColorAttribute(cx, ref, "enhancedCurrentHue")).checks);
            }
            await recordAll(cx, checks);
        }),
        { pics: "CC.C.A4000", expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_4000." },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
