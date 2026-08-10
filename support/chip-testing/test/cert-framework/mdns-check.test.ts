/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import { expectMdns } from "../../src/cert/mdns-check.js";

certTest("FRAMEWORK-MDNS-CHECK", { plan: "n/a", pics: [], app: "all-clusters" })
    .step(1, "Uncommissioned DUT advertises commissionable via mDNS", async cx => {
        const th = cx.devices.th;

        const result = await expectMdns(th, { commissionable: true }, { timeoutMs: 15_000 });
        cx.recorder.check(result);

        if (result.verdict !== "pass") {
            throw new Error(`Expected a commissionable mDNS advertisement, got ${JSON.stringify(result)}`);
        }
    })
    .step(2, "Commissioned DUT advertises exactly one operational mDNS record", async cx => {
        const dut = cx.controllers.dut;
        const th = cx.devices.th;

        const ref = await dut.commission({
            passcode: th.commissioning.passcode,
            discriminator: th.commissioning.discriminator,
        });

        try {
            const operationalInstanceName = await dut.node(ref).operationalMdnsInstanceName();
            const result = await expectMdns(
                th,
                { operationalRecords: 1 },
                { timeoutMs: 15_000, operationalInstanceName },
            );
            cx.recorder.check(result);

            if (result.verdict !== "pass") {
                throw new Error(`Expected exactly one operational mDNS record, got ${JSON.stringify(result)}`);
            }
        } finally {
            // Leaving a fabric/session behind on this shared, host-network process can stall an
            // unrelated test's own commissioning/decommissioning later in the same run (see smoke.test.ts).
            await dut.node(ref).decommission();
        }
    });
