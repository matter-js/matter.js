/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext, CheckRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { RecordedCheck } from "./tc-support.js";
import { attempt, CommissionedRefs, expectCommandInvoke, LOG_TIMEOUT, requireId, withChecks } from "./tc-support.js";

const ON_OFF = Matter.clusters.require("OnOff");
const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const ENDPOINT = 1;

const commissioned = new CommissionedRefs();

/**
 * Invokes `commandName` on the TH's OnOff cluster, then looks for the matching `CommandPathIB` in the TH's
 * log at or after `from`, or leaves that check out where `from` is `undefined`. `OnOff.on`/`OnOff.off`
 * take no fields, so only the path itself is checked.
 */
async function invokeOnOff(
    cx: CertStepContext,
    ref: CertNodeRef,
    commandName: "on" | "off",
    from: number | undefined,
    checks: RecordedCheck[],
): Promise<{ logCheck?: CheckRecord }> {
    const th = cx.devices.th;
    const commandId = requireId(ON_OFF.commands.require(commandName).id, `OnOff.${commandName}`);

    const response = await attempt(
        () => cx.controllers.dut.node(ref).invoke("OnOff", commandName, {}, ENDPOINT),
        () => "status=Success",
    );
    checks.push({ what: `OnOff.${commandName} response`, check: () => response.check });
    if (from === undefined) {
        return {};
    }

    const logCheck = await expectCommandInvoke(
        th.log,
        th.flavor,
        ENDPOINT,
        ON_OFF_ID,
        commandId,
        [],
        from,
        LOG_TIMEOUT,
    );
    checks.push({ what: `CommandDataIB log for OnOff.${commandName}`, check: () => logCheck });
    return { logCheck };
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

            await withChecks(cx, async checks => {
                await invokeOnOff(cx, ref, "on", th.log.mark(), checks);
            });
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
            // Each search starts past the previous invoke's own block, so once one is missing the next
            // search could match that block arriving late, and the later log checks are left out
            let from: number | undefined = cx.devices.th.log.mark();
            await withChecks(cx, async checks => {
                for (let i = 0; i < 3; i++) {
                    const invoked = await invokeOnOff(cx, ref, "off", from, checks);
                    if (invoked.logCheck === undefined || invoked.logCheck.verdict === "fail") {
                        from = undefined;
                    } else if (invoked.logCheck.logLine !== undefined) {
                        from = invoked.logCheck.logLine + 1;
                    }
                }
            });
        }),
        { expected: "On the TH verify the received request messages have the same paths as provided in the command." },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
