/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import {
    colorControlPreconditions,
    readColorAttribute,
    readsColorAttributes,
    sendsColorCommand,
} from "./tc-cc-support.js";
import { CertCheckFailedError, CommissionedRefs, describeValue, recordAll } from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** § 3.2.7.20/21: the mired range a ColorTemperature device may report. */
const MIREDS_MIN = 1;
const MIREDS_MAX = 0xfeff;

/** The TH's physical colour temperature range, read in step 1. */
let physical: { min: number; max: number } | undefined;

function range() {
    if (physical === undefined) {
        throw new CertCheckFailedError("Step 1 recorded no colour temperature range of the TH to move within");
    }
    return physical;
}

const rangeArgs = () => ({
    colorTemperatureMinimumMireds: range().min,
    colorTemperatureMaximumMireds: range().max,
});

certTest("TC-CC-6.4", { plan: "colorcontrol.adoc", pics: ["CC.C", "CC.C.F04"], app: "all-clusters" })
    .step(
        "0",
        "Test setup: commission TH to DUT and set TH OnOff to On; the TH supports ColorTemperature (CC.C.F04).",
        colorControlPreconditions(commissioned, ["colorTemperature"]),
        {
            expected:
                "The TH is commissioned onto the DUT's fabric, its OnOff is On, and its ColorControl has the feature " +
                "the steps below use.",
        },
    )
    .step(
        1,
        "TH provides a server implementation of Color Control with F04(CT)=true and reasonable values of " +
            "ColorTempPhysicalMinMireds and ColorTempPhysicalMaxMireds",
        commissioned.withRef("dut", async (cx, ref) => {
            const min = await readColorAttribute(cx, ref, "colorTempPhysicalMinMireds");
            const max = await readColorAttribute(cx, ref, "colorTempPhysicalMaxMireds");
            const reasonable =
                typeof min.value === "number" &&
                typeof max.value === "number" &&
                MIREDS_MIN <= min.value &&
                min.value < max.value &&
                max.value <= MIREDS_MAX;
            if (typeof min.value === "number" && typeof max.value === "number" && reasonable) {
                physical = { min: min.value, max: max.value };
            }
            await recordAll(cx, [
                ...min.checks,
                ...max.checks,
                {
                    what: "the TH's colour temperature range",
                    check: () => ({
                        type: "response",
                        verdict: reasonable ? "pass" : "fail",
                        detail:
                            `ColorTempPhysicalMinMireds=${describeValue(min.value)}, ` +
                            `ColorTempPhysicalMaxMireds=${describeValue(max.value)}; a range within ` +
                            `${MIREDS_MIN}-${MIREDS_MAX} expected`,
                    }),
                },
            ]);
        }),
        { expected: "The TH reports a colour temperature range the steps below move within." },
    )
    .step(
        "2a",
        "DUT sends MoveToColorTemperature command to TH",
        sendsColorCommand(commissioned, "moveToColorTemperature", () => ({
            colorTemperatureMireds: Math.floor((range().min + range().max) / 2),
            transitionTime: 0,
        })),
        {
            pics: "CC.C.C0a.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x0a CommandFields matches MoveToColorTemperature " +
                "command parameters.",
        },
    )
    .step(
        "2b",
        "DUT reads ColorTemperatureMired attribute from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "colorTemperatureMireds"),
        {
            pics: "CC.C.C0a.Tx & CC.C.A0007",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0007.",
        },
    )
    .step(
        "3a",
        "DUT sends MoveColorTemperature command to TH",
        sendsColorCommand(commissioned, "moveColorTemperature", () => ({ moveMode: 1, rate: 10, ...rangeArgs() })),
        {
            pics: "CC.C.C4b.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x4b CommandFields matches MoveColorTemperature " +
                "command parameters.",
        },
    )
    .step(
        "3b",
        "DUT reads ColorTemperatureMired attribute from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "colorTemperatureMireds"),
        {
            pics: "CC.C.C4b.Tx & CC.C.A0007",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0007.",
        },
    )
    .step(
        "4a",
        "DUT sends StepColorTemperature command to TH",
        sendsColorCommand(commissioned, "stepColorTemperature", () => ({
            stepMode: 1,
            stepSize: 10,
            transitionTime: 0,
            ...rangeArgs(),
        })),
        {
            pics: "CC.C.C4c.Tx",
            expected:
                "TH receives InvokeRequestMessage with CommandID 0x4c CommandFields matches StepColorTemperature " +
                "command parameters.",
        },
    )
    .step(
        "4b",
        "DUT reads ColorTemperatureMired attribute from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "colorTemperatureMireds"),
        {
            pics: "CC.C.C4c.Tx & CC.C.A0007",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0007.",
        },
    )
    .step("5a", "DUT sends StopMoveStep command to TH.", sendsColorCommand(commissioned, "stopMoveStep"), {
        pics: "CC.C.C47.Tx",
        expected:
            "TH receives InvokeRequestMessage with CommandID 0x47 CommandFields matches StopMoveStep command parameters.",
    })
    .step(
        "5b",
        "DUT reads ColorTemperatureMired attribute from TH (potentially multiple times)",
        readsColorAttributes(commissioned, "colorTemperatureMireds"),
        {
            pics: "CC.C.C47.Tx & CC.C.A0007",
            expected: "TH receives read request from Cluster 0x300 Attribute 0x0000_0007.",
        },
    )
    .finalize(cx => {
        physical = undefined;
        return commissioned.decommissionAll(cx);
    });
