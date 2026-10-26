/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import { certTest } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import {
    attempt,
    CertCheckFailedError,
    chipCommandField,
    CommissionedRefs,
    describeValue,
    record,
    requireId,
    sendCommand,
} from "./tc-support.js";

const MODE_SELECT = Matter.clusters.require("ModeSelect");

/** Both THs put ModeSelect on endpoint 1. */
const ENDPOINT = 1;

const commissioned = new CommissionedRefs();

/** The mode numbers step 1 recorded, in the order the TH listed them. */
let supportedModes: number[] | undefined;

/** The `Mode` of every entry in a SupportedModes value, or why the value is not one. */
function modeNumbers(value: unknown): { modes: number[] } | { error: string } {
    if (!Array.isArray(value) || value.length === 0) {
        return { error: `SupportedModes is ${describeValue(value)}, not a non-empty list` };
    }
    const modes = new Array<number>();
    for (const entry of value) {
        const mode: unknown = typeof entry === "object" && entry !== null && "mode" in entry ? entry.mode : undefined;
        if (typeof mode !== "number") {
            return { error: `SupportedModes entry ${describeValue(entry)} has no numeric Mode` };
        }
        modes.push(mode);
    }
    return { modes };
}

certTest("TC-MOD-2.2", { plan: "modeselect.adoc", pics: ["MOD.C.C00.Tx"], app: "all-clusters" })
    .step("0", "Preconditions: the DUT commissions the TH.", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step(
        1,
        "DUT reads the SupportedModes attribute from the TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const read = await attempt(
                () =>
                    cx.controllers.dut.node(ref).readAttribute({
                        endpoint: ENDPOINT,
                        cluster: requireId(MODE_SELECT.id, "ModeSelect cluster"),
                        attribute: requireId(
                            MODE_SELECT.attributes.require("supportedModes").id,
                            "ModeSelect.supportedModes",
                        ),
                    }),
                value => `SupportedModes=${describeValue(value)}`,
            );
            if (!read.ok) {
                record(cx, read.check, "SupportedModes read");
                return;
            }

            const parsed = modeNumbers(read.value);
            if ("error" in parsed) {
                record(cx, { type: "response", verdict: "fail", detail: parsed.error }, "SupportedModes content");
                return;
            }
            supportedModes = parsed.modes;
            record(
                cx,
                { type: "response", verdict: "pass", detail: `TH supports modes ${parsed.modes.join(", ")}` },
                "SupportedModes content",
            );
        }),
        {
            pics: "MOD.C.A0002",
            expected:
                "Verify that the TH response provides a list of supported modes. Record the mode numbers for usage " +
                "in steps 2.",
        },
    )
    .step(
        2,
        "DUT sends a ChangeToMode command to the TH with an integer from the list in step 1.",
        commissioned.withRef("dut", async (cx, ref) => {
            if (supportedModes === undefined) {
                throw new CertCheckFailedError("step 1 recorded no supported modes");
            }

            // Any listed mode is valid; one that is not 0 keeps a NewMode lost on the way from matching the default
            const newMode = supportedModes.find(mode => mode !== 0) ?? supportedModes[0];

            await sendCommand(
                cx,
                ref,
                {
                    cluster: MODE_SELECT,
                    endpoint: ENDPOINT,
                    command: "changeToMode",
                    args: { newMode },
                },
                {
                    label: `ChangeToMode carries exactly NewMode (ID 0) = ${newMode}, a mode step 1 recorded`,
                    chip: [chipCommandField({ id: 0, value: newMode })],
                    matterjs: `newMode: ${newMode}`,
                },
            );
        }),
        {
            pics: "MOD.C.C00.Tx",
            expected: "Verify TH responds with a successful (value 0x00) status response.",
        },
    )
    .finalize(cx => {
        supportedModes = undefined;
        return commissioned.decommissionAll(cx);
    });
