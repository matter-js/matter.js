/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import { certTest } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import { chipCommandField, CommissionedRefs, sendCommand } from "./tc-support.js";

const THERMOSTAT = Matter.clusters.require("Thermostat");

/** Both THs put Thermostat on endpoint 1. */
const ENDPOINT = 1;

/** SetpointRaiseLowerModeEnum Heat; both THs have the Heating feature. */
const MODE_HEAT = 0;

/** 1 °C in the command's 0.1 °C steps; the plan asks for a value between 1 and 127, or -127 and -1. */
const AMOUNT = 10;

const commissioned = new CommissionedRefs();

/** A step that has the DUT send SetpointRaiseLower with `amount`, an int8 that chip prints as `(signed)`. */
function sendsRaiseLower(amount: number) {
    return commissioned.withRef("dut", (cx, ref) =>
        sendCommand(
            cx,
            ref,
            {
                cluster: THERMOSTAT,
                endpoint: ENDPOINT,
                command: "setpointRaiseLower",
                args: { mode: MODE_HEAT, amount },
            },
            {
                label: `SetpointRaiseLower carries exactly Mode (ID 0) = ${MODE_HEAT} and Amount (ID 1) = ${amount}`,
                chip: [
                    chipCommandField({ id: 0, value: MODE_HEAT }),
                    chipCommandField({ id: 1, value: amount, signed: true }),
                ],
                matterjs: `mode: ${MODE_HEAT} amount: ${amount}`,
            },
        ),
    );
}

certTest("TC-TSTAT-3.2", { plan: "thermostat.adoc", pics: ["TSTAT.C"], app: "all-clusters" })
    .step("0", "Test setup: commission DUT to TH.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step(
        1,
        "DUT increases the temperature by sending a SetpointRaiseLower command to the Test Harness, with a valid Mode " +
            "argument (0, 1 or 2) and a reasonable positive value that is supported by the DUT.",
        sendsRaiseLower(AMOUNT),
        {
            pics: "TSTAT.C.C00.Tx",
            expected:
                "Test Harness receives the SetpointRaiseLower command from the DUT. Verify the command has two " +
                "parameters: ID 0: the type is an enum8, the value has to be 0, 1 or 2. ID 1: the type is an int8, " +
                "the value is between 1 and 127.",
        },
    )
    .step(
        2,
        "DUT lowers the temperature by sending a SetpointRaiseLower command to the Test Harness, with a valid Mode " +
            "argument (0, 1 or 2) and a reasonable negative value that is supported by the DUT.",
        sendsRaiseLower(-AMOUNT),
        {
            pics: "TSTAT.C.C00.Tx",
            expected:
                "Test Harness receives the SetpointRaiseLower command from the DUT. Verify the command has two " +
                "parameters: ID 0: the type is an enum8, the value has to be 0, 1 or 2. ID 1: the type is an int8, " +
                "the value is between -127 and -1.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
