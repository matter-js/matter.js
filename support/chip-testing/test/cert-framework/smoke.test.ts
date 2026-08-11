/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import { certTest } from "@matter/testing";
import { expect } from "chai";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const VENDOR_ID_ATTRIBUTE = BASIC_INFORMATION.attributes.require("vendorId");

// Carries the commissioned node ref from step 1 to step 2's decommission call.
let commissionedRef: string | undefined;

certTest("FRAMEWORK-SMOKE", { plan: "n/a", pics: [], app: "all-clusters" })
    .step(1, "Commission the DUT and read VendorID", async cx => {
        const dut = cx.controllers.dut;
        const th = cx.devices.th;

        const ref = await dut.commission({
            passcode: th.commissioning.passcode,
            discriminator: th.commissioning.discriminator,
        });
        commissionedRef = ref;
        const node = dut.node(ref);

        const vendorId = await node.readAttribute({
            endpoint: 0,
            cluster: BASIC_INFORMATION.id,
            attribute: VENDOR_ID_ATTRIBUTE.id,
        });

        const pass = vendorId === 0xfff1;
        cx.recorder.check({
            type: "response",
            verdict: pass ? "pass" : "fail",
            detail: `VendorID = ${vendorId}`,
        });

        if (!pass) {
            throw new Error(`Unexpected VendorID ${vendorId}`);
        }
    })
    .step(2, "Observe a reliable device log line", async cx => {
        const th = cx.devices.th;

        const result = await th.log.expect(
            { matterjs: /is online/, chip: /Server Listening/ },
            { flavor: th.flavor, timeoutMs: 15_000 },
        );

        cx.recorder.check({
            type: "device-log",
            verdict: result.verdict,
            pattern: result.verdict === "pass" ? result.pattern : undefined,
            matched: result.verdict === "pass" ? result.matched.text : undefined,
        });

        if (result.verdict !== "pass") {
            throw new Error(`Expected a device log line for flavor "${th.flavor}", got ${JSON.stringify(result)}`);
        }

        // Decommission what step 1 commissioned. A left-behind fabric/session on this shared,
        // host-network process can stall an unrelated test's own commissioning/decommissioning
        // later in the same run (observed empirically running this spec alongside
        // controller-adapter.test.ts).
        if (commissionedRef !== undefined) {
            await cx.controllers.dut.node(commissionedRef).decommission();
            commissionedRef = undefined;
        }
    });

function latestEvidenceDirFor(tc: string): string {
    const base = env.MATTER_CERT_EVIDENCE_DIR;
    if (!base) {
        throw new Error("MATTER_CERT_EVIDENCE_DIR is not set");
    }
    const entries = readdirSync(base).filter(name => name.endsWith(`-${tc}`));
    if (entries.length === 0) {
        throw new Error(`No evidence directory found for ${tc} under ${base}`);
    }
    entries.sort();
    return join(base, entries[entries.length - 1]);
}

describe("FRAMEWORK-SMOKE evidence", () => {
    it("wrote result.json and device logs to the evidence directory", () => {
        const dir = latestEvidenceDirFor("FRAMEWORK-SMOKE");

        expect(existsSync(join(dir, "result.json"))).to.equal(true);
        expect(existsSync(join(dir, "device-th.log"))).to.equal(true);

        const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf-8"));
        expect(result.tc).to.equal("FRAMEWORK-SMOKE");
        expect(result.verdict).to.equal("pass");
        expect(result.steps).to.have.lengthOf(2);
        expect(result.steps.every((step: { verdict: string }) => step.verdict === "pass")).to.equal(true);
    });
});
