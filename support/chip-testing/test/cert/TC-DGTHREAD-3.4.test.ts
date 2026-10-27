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
    CommissionedRefs,
    describeValue,
    MATTERJS_NO_PAYLOAD,
    record,
    requireId,
    sendCommand,
} from "./tc-support.js";

const THREAD_DIAGNOSTICS = Matter.clusters.require("ThreadNetworkDiagnostics");

/** chip's all-clusters app puts ThreadNetworkDiagnostics, with the ErrorCounts feature both steps need, on the root. */
const ENDPOINT = 0;

const commissioned = new CommissionedRefs();

certTest("TC-DGTHREAD-3.4", {
    plan: "thread_nw_diagnostics.adoc",
    pics: ["DGTHREAD.C"],
    app: "all-clusters",

    // matter.js's all-clusters test device has no ThreadNetworkDiagnostics cluster.
    flavors: ["chip-local", "chip-docker"],
})
    .step(1, "Commission TH to DUT", commissionThStep(commissioned), {
        expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
    })
    .step(
        2,
        "DUT sends ResetCounts Command to TH",
        commissioned.withRef("dut", (cx, ref) =>
            sendCommand(
                cx,
                ref,
                { cluster: THREAD_DIAGNOSTICS, endpoint: ENDPOINT, command: "resetCounts", args: {} },
                { label: "ResetCounts carries no parameters", chip: [], matterjs: MATTERJS_NO_PAYLOAD },
            ),
        ),
        {
            pics: "DGTHREAD.C.C00.Tx",
            expected: "If DGTHREAD.C.C00.Tx(ResetCounts), Test Harness receives the ResetCounts Command from the DUT",
        },
    )
    .step(
        3,
        "DUT reads OverrunCount attribute from TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const read = await attempt(
                () =>
                    cx.controllers.dut.node(ref).readAttribute({
                        endpoint: ENDPOINT,
                        cluster: requireId(THREAD_DIAGNOSTICS.id, "ThreadNetworkDiagnostics cluster"),
                        attribute: requireId(
                            THREAD_DIAGNOSTICS.attributes.require("overrunCount").id,
                            "ThreadNetworkDiagnostics.overrunCount",
                        ),
                    }),
                value => `OverrunCount=${describeValue(value)}`,
            );
            if (!read.ok) {
                record(cx, read.check, "OverrunCount read");
                return;
            }

            // OverrunCount is a uint64 without the nullable quality, so anything else is not a successful read
            const { value } = read;
            const isCount =
                (typeof value === "bigint" || (typeof value === "number" && Number.isInteger(value))) && value >= 0;
            record(
                cx,
                isCount ? read.check : { ...read.check, verdict: "fail", detail: `${read.check.detail}, not a uint64` },
                "OverrunCount read",
            );
        }),
        {
            pics: "DGTHREAD.C.A0006",
            expected: "1.Verify that DUT reads OverrunCount from the TH successfully",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
