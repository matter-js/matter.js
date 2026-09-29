/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import {
    ABSENCE_WINDOW,
    BindRun,
    OFF_COMMAND,
    ON_COMMAND,
    ON_OFF_ID,
    receivedUnicast,
    trigger,
} from "./tc-bind-support.js";
import { expectNoCommandInvoke, withChecks } from "./tc-support.js";

/** The OnOff server each TH is bound through, as the plan's preconditions place them. */
const TH2_ENDPOINT = 1;
const TH3_ENDPOINT = 2;

const run = new BindRun(["dut", "th2", "th3"] as const);

certTest("TC-BIND-2.1", {
    plan: "binding.adoc",
    pics: ["BIND.C", "MCORE.ROLE.CONTROLLER", "!MCORE.DT_SW_COMP"],
    app: "light-switch",
    controllers: { th1: "helper" },
    devices: { dut: "light-switch", th2: "all-clusters", th3: "all-clusters" },

    // chip's light-switch-app is not part of the image this harness runs
    flavors: ["matterjs"],
})
    .step(1, "Factory Reset DUT", run.factoryResetStep("dut"), { expected: "The DUT comes back holding no fabric." })
    .step(2, "Commission DUT to TH1's fabric", run.commissionStep("dut", "the DUT"), {
        expected: "TH1 commissions the DUT onto its fabric.",
    })
    .step(3, "Commission TH2 to TH1's fabric (Node ID = 2)", run.commissionStep("th2", "TH2"), {
        expected: "TH1 commissions TH2 onto its fabric; the binding entries name the node id TH1 assigned.",
    })
    .step(4, "Commission TH3 to TH1's fabric (Node ID = 3)", run.commissionStep("th3", "TH3"), {
        expected: "TH1 commissions TH3 onto its fabric; the binding entries name the node id TH1 assigned.",
    })
    .step(
        5,
        "TH1 writes Binding entries into DUT on the endpoint with the On/Off client with Entry 1: Node = 2, " +
            "Cluster = 0x0006, Endpoint = 1 and Entry 2: Node = 3, Cluster = 0x0006, Endpoint = 2",
        run.writeBindingStep("dut", [
            { role: "th2", endpoint: TH2_ENDPOINT },
            { role: "th3", endpoint: TH3_ENDPOINT },
        ]),
        { expected: "The DUT accepts the write and holds both entries." },
    )
    .step(
        6,
        "TH1 enables DUT as Controller",
        cx =>
            withChecks(cx, async checks => {
                await run.grantOperate(cx, "th2", "dut", TH2_ENDPOINT, checks);
                await run.grantOperate(cx, "th3", "dut", TH3_ENDPOINT, checks);
            }),
        {
            expected:
                "TH2 and TH3 each hold an ACL entry letting the DUT operate OnOff on the bound endpoint. TH1, not the " +
                "DUT, writes them: the DUT only sends along the bindings it was given.",
        },
    )
    .step(
        7,
        "DUT is triggered to send On command to its binding node entries",
        cx =>
            withChecks(cx, async checks => {
                const { dut, th2, th3 } = cx.devices;
                const [th2From, th3From] = await Promise.all([th2.log.markSettled(), th3.log.markSettled()]);

                const sent = await trigger(dut, "on");
                checks.push({ what: "The DUT's send", check: () => sent.check });

                const [atTh2, atTh3] = await Promise.all([
                    receivedUnicast(th2, TH2_ENDPOINT, ON_COMMAND, th2From),
                    receivedUnicast(th3, TH3_ENDPOINT, ON_COMMAND, th3From),
                ]);
                checks.push({ what: "TH2 received On on endpoint 1", check: () => atTh2 });
                checks.push({ what: "TH3 received On on endpoint 2", check: () => atTh3 });
            }),
        {
            pics: "OO.C.C01.Tx",
            expected: "TH2 receives On command (Endpoint 1). TH3 receives On command (Endpoint 2).",
        },
    )
    .step(8, "TH1 reads OnOff attribute from TH2 (Endpoint 1)", run.readOnOffStep("th2", TH2_ENDPOINT, true), {
        pics: "OO.C.C01.Tx",
        expected: "Verify that the value is set to On.",
    })
    .step(
        9,
        "TH1 removes second binding entry corresponding to TH3 from DUT",
        run.writeBindingStep("dut", [{ role: "th2", endpoint: TH2_ENDPOINT }]),
        { expected: "The DUT accepts the write and holds only the entry for TH2." },
    )
    .step(
        10,
        "DUT is triggered to send off command to its binding entries",
        cx =>
            withChecks(cx, async checks => {
                const { dut, th2, th3 } = cx.devices;
                const [th2From, th3From] = await Promise.all([th2.log.markSettled(), th3.log.markSettled()]);

                const sent = await trigger(dut, "off");
                checks.push({ what: "The DUT's send", check: () => sent.check });

                const [atTh2, notAtTh3] = await Promise.all([
                    receivedUnicast(th2, TH2_ENDPOINT, OFF_COMMAND, th2From),
                    expectNoCommandInvoke(
                        th3.log,
                        th3.flavor,
                        TH3_ENDPOINT,
                        ON_OFF_ID,
                        OFF_COMMAND,
                        th3From,
                        ABSENCE_WINDOW,
                    ),
                ]);
                checks.push({ what: "TH2 received Off on endpoint 1", check: () => atTh2 });
                checks.push({ what: "TH3 received no Off on endpoint 2", check: () => notAtTh3 });
            }),
        {
            pics: "OO.C.C00.Tx",
            expected: "TH2 receives off command (Endpoint 1). TH3 does not receive off command (Endpoint 2).",
        },
    )
    .step(11, "TH1 reads OnOff attribute from TH2 (Endpoint 1)", run.readOnOffStep("th2", TH2_ENDPOINT, false), {
        pics: "OO.C.C00.Tx",
        expected: "Verify that the value is set to Off.",
    })
    .step(12, "TH1 reads OnOff attribute from TH3 (Endpoint 2)", run.readOnOffStep("th3", TH3_ENDPOINT, true), {
        pics: "OO.C.C01.Tx",
        expected: "Verify that the value is set to On.",
    })
    .finalize(cx => run.finalize(cx, "dut"));
