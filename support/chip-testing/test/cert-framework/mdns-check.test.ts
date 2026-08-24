/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, Time } from "@matter/main";
import { certTest } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";
import { CertCheckFailedError } from "../cert/tc-support.js";

// An `operationalRecords: 0` check only settles at its window's end, so this bounds the step's own
// wall-clock cost as well as the proof below that the check held the window.
const WITHDRAWAL_WINDOW_MS = 5_000;

certTest("FRAMEWORK-MDNS-CHECK", { plan: "n/a", pics: [], app: "all-clusters" })
    .step(1, "Uncommissioned DUT advertises commissionable via mDNS", async cx => {
        const th = cx.devices.th;

        const result = await expectMdns(th, { commissionable: true }, { timeoutMs: 15_000 });
        cx.recorder.check(result);

        if (result.verdict !== "pass") {
            throw new CertCheckFailedError(
                `Expected a commissionable mDNS advertisement, got ${JSON.stringify(result)}`,
            );
        }
    })
    .step(2, "Commissioned DUT advertises exactly one operational mDNS record, withdrawn on decommission", async cx => {
        const dut = cx.controllers.dut;
        const th = cx.devices.th;

        const ref = await dut.commission({
            passcode: th.commissioning.passcode,
            discriminator: th.commissioning.discriminator,
        });

        // Leaving a fabric/session behind on this shared, host-network process can stall an
        // unrelated test's own commissioning/decommissioning later in the same run (see smoke.test.ts).
        let fabricLive = true;
        try {
            const operationalInstanceName = await dut.node(ref).operationalMdnsInstanceName();
            const present = await expectMdns(
                th,
                { operationalRecords: 1 },
                { timeoutMs: 15_000, operationalInstanceName },
            );
            cx.recorder.check(present);
            if (present.verdict !== "pass") {
                throw new CertCheckFailedError(
                    `Expected exactly one operational mDNS record, got ${JSON.stringify(present)}`,
                );
            }

            const liveContradictsAbsence = await expectMdns(
                th,
                { operationalRecords: 0 },
                { timeoutMs: 2_000, operationalInstanceName },
            );
            if (liveContradictsAbsence.verdict !== "fail") {
                throw new CertCheckFailedError(
                    "An absence check against a live record must fail, got " + JSON.stringify(liveContradictsAbsence),
                );
            }
            // Recorded as the pass it is for this step — the raw "fail" record would read as a
            // defect inside a passing step.
            cx.recorder.check({
                type: "network",
                verdict: "pass",
                detail: `absence check against a live record correctly failed (${liveContradictsAbsence.detail})`,
            });

            // Flag first: a throw here leaves the fabric's state unknown, and a second decommission
            // attempt from the finally would replace this error with its own.
            fabricLive = false;
            await dut.node(ref).decommission();

            const start = Time.nowUs;
            const withdrawn = await expectMdns(
                th,
                { operationalRecords: 0 },
                { timeoutMs: WITHDRAWAL_WINDOW_MS, operationalInstanceName },
            );
            const elapsed = Millis(Time.nowUs - start);
            cx.recorder.check(withdrawn);
            if (withdrawn.verdict !== "pass") {
                throw new CertCheckFailedError(
                    `Expected the operational record withdrawn after decommission, got ${JSON.stringify(withdrawn)}`,
                );
            }
            // A pass settled early would mean the check took an unheard name for a withdrawn one
            if (elapsed < Millis(WITHDRAWAL_WINDOW_MS - 500)) {
                throw new CertCheckFailedError(
                    `Absence settled after ${Duration.format(elapsed)} — it is only provable by the whole ` +
                        Duration.format(Millis(WITHDRAWAL_WINDOW_MS)) +
                        " window",
                );
            }
        } finally {
            if (fabricLive) {
                await dut.node(ref).decommission();
            }
        }
    });
