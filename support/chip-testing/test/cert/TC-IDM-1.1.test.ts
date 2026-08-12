/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext, CheckRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import { CommissionedRefs, expectCommandInvoke, requireId } from "./tc-support.js";

const ON_OFF = Matter.clusters.require("OnOff");
const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const ENDPOINT = 1;

const commissioned = new CommissionedRefs();

/** Invokes `commandName` on the TH's OnOff cluster, then verifies TH's log captured the matching
 * `CommandPathIB`. `OnOff.on`/`OnOff.off` take no fields, so only the path itself is checked. */
async function invokeOnOffAndCheck(
    cx: CertStepContext,
    ref: CertNodeRef,
    commandName: "on" | "off",
    from: number,
): Promise<CheckRecord> {
    const th = cx.devices.th;
    const commandId = requireId(ON_OFF.commands.require(commandName).id, `OnOff.${commandName}`);

    try {
        await cx.controllers.dut.node(ref).invoke("OnOff", commandName, {}, ENDPOINT);
    } catch (e) {
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }
    cx.recorder.check({ type: "response", verdict: "pass", detail: "status=Success" });

    const logCheck = await expectCommandInvoke(th.log, th.flavor, ENDPOINT, ON_OFF_ID, commandId, [], from, 15_000);
    cx.recorder.check(logCheck);
    if (logCheck.verdict === "fail") {
        throw new Error(`CommandDataIB log check failed for OnOff.${commandName}: ${JSON.stringify(logCheck)}`);
    }
    return logCheck;
}

certTest("TC-IDM-1.1", { plan: "interactiondatamodel.adoc", pics: ["MCORE.IDM.C.InvokeRequest"], app: "all-clusters" })
    .step(
        1,
        "DUT sends the Invoke Request Message to the TH. The Message should contain one valid CommandDataIB, " +
            "which has the specific Endpoint, Specific Cluster and Specific Command.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const from = th.log.mark();
            await invokeOnOffAndCheck(cx, ref, "on", from);
        },
        { expected: "On the TH verify the received request message has the same paths as provided in the command." },
    )
    .step(
        2,
        "DUT sends the Invoke Request Message to the TH. The Message should contain the wildcard for Endpoint, " +
            "specific Cluster and Specific Command in the CommandDataIB.",
        async () => {},
        { notApplicable: "Out of Scope in CHIP's certification harness" },
    )
    .step(
        3,
        "DUT sends the Invoke Request Message to the TH. The Message should contain one valid CommandDataIB, " +
            "which has the specific Endpoint, Specific Cluster and Specific Command. Send 2 more Invoke Request " +
            "Messages to the TH.",
        commissioned.withRef("dut", async (cx, ref) => {
            let from = cx.devices.th.log.mark();
            for (let i = 0; i < 3; i++) {
                const logCheck = await invokeOnOffAndCheck(cx, ref, "off", from);
                if (logCheck.logLine !== undefined) {
                    from = logCheck.logLine + 1;
                }
            }
        }),
        { expected: "On the TH verify the received request messages have the same paths as provided in the command." },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
