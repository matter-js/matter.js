/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { chipCommandField, CommissionedRefs, sendCommand } from "./tc-support.js";
import { WINDOW_COVERING, WINDOW_COVERING_ENDPOINT, windowCoveringPreconditions } from "./tc-wncv-support.js";

/** The plan's 50%, in the commands' Percent100ths unit. */
const HALF_OPEN = 5000;

const commissioned = new CommissionedRefs();

/** A step that has the DUT send `command` with its one field, `field`, set to 50%. */
function sendsHalfOpen(command: string, field: string) {
    return commissioned.withRef("dut", (cx, ref) =>
        sendCommand(
            cx,
            ref,
            {
                cluster: WINDOW_COVERING,
                endpoint: WINDOW_COVERING_ENDPOINT,
                command,
                args: { [field]: HALF_OPEN },
            },
            {
                label: `${command} carries exactly ${field} (ID 0) = ${HALF_OPEN}`,
                chip: [chipCommandField({ id: 0, value: HALF_OPEN })],
                matterjs: `${field}: ${HALF_OPEN}`,
            },
        ),
    );
}

certTest("TC-WNCV-7.1", { plan: "window_covering.adoc", pics: ["WNCV.C"], app: "all-clusters" })
    .step(
        "0",
        "Preconditions: the DUT commissions the TH, and the TH supports position-aware Lift and position-aware Tilt.",
        // Stricter than the plan's "and/or": for a TH with only one position-aware axis, the plan defines no outcome
        // for the other axis's command
        windowCoveringPreconditions(commissioned, features =>
            ["lift", "positionAwareLift", "tilt", "positionAwareTilt"].every(feature => features.has(feature))
                ? undefined
                : "the TH lacks position-aware Lift or position-aware Tilt",
        ),
        {
            expected:
                "The TH is commissioned onto the DUT's fabric and its FeatureMap has the LF & PA_LF and TL & PA_TL " +
                "flags, so both steps below expect SUCCESS.",
        },
    )
    .step(
        "1a",
        "DUT sends GoToLiftPercentage command with 50% to TH",
        sendsHalfOpen("goToLiftPercentage", "liftPercent100thsValue"),
        {
            pics: "WNCV.C.C05.Tx",
            expected:
                "Parameter value is 5000 Percent100ths, If (WNCV.S.F00(LF) & WNCV.S.F02(PA_LF)) Verify DUT responds " +
                "w/ status SUCCESS(0x00)",
        },
    )
    .step(
        "2a",
        "DUT sends GoToTiltPercentage command with 50% to TH",
        sendsHalfOpen("goToTiltPercentage", "tiltPercent100thsValue"),
        {
            pics: "WNCV.C.C08.Tx",
            expected:
                "Parameter value is 5000 Percent100ths, If (WNCV.S.F01(TL) & WNCV.S.F04(PA_TL)) Verify DUT responds " +
                "w/ status SUCCESS(0x00)",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
