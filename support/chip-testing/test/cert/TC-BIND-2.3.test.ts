/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { IANA_GROUPCAST_MULTICAST_ADDRESS } from "@matter/main/protocol";
import type { CertStepContext, CheckRecord } from "@matter/testing";
import { certTest, CertStepNotApplicableError } from "@matter/testing";
import {
    ABSENCE_WINDOW,
    BindRun,
    OFF_COMMAND,
    ON_COMMAND,
    ON_OFF_ID,
    type GroupKeySet,
    randomGroupKeySet,
    receivedUnicast,
    trigger,
} from "./tc-bind-support.js";
import {
    attempt,
    expectNoCommandInvoke,
    expectSequence,
    expectGroupCommandArrival,
    LOG_TIMEOUT,
    matterjsGroupInvokeSent,
    withChecks,
} from "./tc-support.js";

const GROUP_ID = 1;
const GROUP_KEY_SET_ID = 0x01a1;

/** TH2's OnOff server, which is also where it joins the group. */
const TH2_ENDPOINT = 1;

type Branch = "groupcast" | "legacy";

function branchName(branch: Branch | undefined) {
    return branch === "groupcast" ? "Groupcast" : "GroupKeyManagement";
}

/**
 * Declares one run of the plan. The plan branches on whether the Groupcast cluster is enabled on the RootNode endpoint,
 * and step 5 reads that off the DUT and TH2 rather than taking it from the declaration: each run then takes the branch
 * its devices call for, and a run whose devices disagree fails instead of running one branch against the other.
 */
function tcBind23(tc: string, apps: { dut: string; th2: string }, intended: Branch) {
    const run = new BindRun(["dut", "th2"] as const);

    /** Key1 and EpochKey0 of the plan's step 5, generated there and given to TH2 and the DUT alike. */
    let keySet: GroupKeySet | undefined;

    let branch: Branch | undefined;

    function requireKeySet() {
        if (keySet === undefined) {
            throw new InternalError("Step 5 generates the key set the later steps send");
        }
        return keySet;
    }

    /** Runs `body` only on `wanted`; on the other branch the step is not applicable, as the plan says. */
    function on(wanted: Branch, body: (cx: CertStepContext) => Promise<void>) {
        return async (cx: CertStepContext) => {
            if (branch === undefined) {
                throw new InternalError("Step 5 did not establish which branch of the plan this run takes");
            }
            if (branch !== wanted) {
                throw new CertStepNotApplicableError(
                    branch === "groupcast"
                        ? "The Groupcast cluster is enabled on the RootNode endpoint of the DUT and TH2 (step 5), so " +
                              "the plan skips this step"
                        : "The Groupcast cluster is not enabled on the RootNode endpoint of the DUT and TH2 (step 5), " +
                              "so the plan skips this step",
                );
            }
            await body(cx);
        };
    }

    /** Step 5: which branch the devices call for, and the key material both branches send. */
    async function chooseBranch(cx: CertStepContext) {
        branch = undefined;
        keySet = randomGroupKeySet(GROUP_KEY_SET_ID);
        await withChecks(cx, async checks => {
            const dutHas = await run.rootHasGroupcast(cx, "dut", checks);
            const th2Has = await run.rootHasGroupcast(cx, "th2", checks);

            const agree = dutHas !== undefined && dutHas === th2Has;
            if (agree) {
                branch = dutHas ? "groupcast" : "legacy";
            }
            // The devices decide the branch; the run's name says which one they were chosen to exercise
            const chosen: CheckRecord = {
                type: "response",
                verdict: agree && branch === intended ? "pass" : "fail",
                detail: !agree
                    ? "the DUT and TH2 disagree on the Groupcast cluster, so no branch of the plan fits both"
                    : `this run takes the plan's ${branchName(branch)} branch` +
                      (branch === intended
                          ? ""
                          : `, where its devices were chosen for the ${branchName(intended)} one`),
            };
            checks.push({ what: "The branch the plan takes for these devices", check: () => chosen });
        });
    }

    /** Step 14a: the DUT's group send and TH2's arrival of it for group 1 on its OnOff endpoint. */
    async function groupOnReachesTh2(cx: CertStepContext) {
        await withChecks(cx, async checks => {
            const { dut, th2 } = cx.devices;
            const [dutFrom, th2From] = await Promise.all([dut.log.markSettled(), th2.log.markSettled()]);

            const sent = await trigger(dut, "on");
            checks.push({ what: "The DUT's send", check: () => sent.check });

            const sendLine = matterjsGroupInvokeSent(GROUP_ID, ON_OFF_ID, ON_COMMAND);
            const [asGroup, arrived] = await Promise.all([
                expectSequence(
                    dut.log,
                    dut.flavor,
                    `a group OnOff.on for group ${GROUP_ID}`,
                    { matterjs: [sendLine] },
                    dutFrom,
                    LOG_TIMEOUT,
                ),
                expectGroupCommandArrival(
                    th2.log,
                    th2.flavor,
                    `TH2 receiving group ${GROUP_ID}'s OnOff.on and dispatching it to endpoint ${TH2_ENDPOINT}`,
                    { group: GROUP_ID, endpoint: TH2_ENDPOINT, cluster: ON_OFF_ID, command: ON_COMMAND },
                    th2From,
                    LOG_TIMEOUT,
                ),
            ]);

            // The address the DUT chose is the branch's own: Groupcast's default policy, or the fabric's per-group one
            let addressed = asGroup;
            if (asGroup.verdict === "pass" && asGroup.matched !== undefined) {
                const [, address] = sendLine.exec(asGroup.matched) ?? [];
                const expected =
                    branch === "groupcast"
                        ? address === IANA_GROUPCAST_MULTICAST_ADDRESS
                        : address?.startsWith("ff35:") === true;
                addressed = {
                    ...asGroup,
                    verdict: expected ? "pass" : "fail",
                    detail:
                        `the DUT sent group ${GROUP_ID}'s OnOff.on to [${address}], ` +
                        (branch === "groupcast"
                            ? `and Groupcast's IanaAddr policy makes it ${IANA_GROUPCAST_MULTICAST_ADDRESS}`
                            : "and the fabric's per-group address starts ff35:"),
                };
            }
            checks.push({ what: "The DUT sent OnOff.on to group 1 as a group message", check: () => addressed });

            // Also what orders the read of step 14b after the command: a group message is unacknowledged
            checks.push({ what: "TH2 received group 1's On on endpoint 1", check: () => arrived });
        });
    }

    certTest(tc, {
        plan: "binding.adoc",
        pics: ["BIND.C", "GRPKEY.C"],
        // TH2 is the device the harness starts first, so it gets port 5540: a group message goes to that port (Core
        // § 4.16.2), and a matter.js device receives one on its own operational port only. The DUT's PICS still come
        // from its own app, the device role named `dut`
        app: apps.th2,
        controllers: { th1: "helper" },
        devices: { th2: apps.th2, dut: apps.dut },

        // chip's light-switch-app is not part of the image this harness runs
        flavors: ["matterjs"],
    })
        .step(1, "Factory Reset DUT", run.factoryResetStep("dut"), {
            expected: "The DUT comes back holding no fabric.",
        })
        .step(2, "Commission DUT to TH1's fabric", run.commissionStep("dut", "the DUT"), {
            expected: "TH1 commissions the DUT onto its fabric.",
        })
        .step(3, "TH1 enables DUT as Controller", async () => {}, {
            notApplicable:
                "A group command is admitted by TH2's ACL entry with the AuthMode Group (precondition 4, step 4a), " +
                "not by an entry naming the DUT, and TH2 joins the fabric only in step 4.",
        })
        .step(4, "Commission TH2 to TH1's fabric (Node ID = 2)", run.commissionStep("th2", "TH2"), {
            expected: "TH1 commissions TH2 onto its fabric.",
        })
        .step(
            "4a",
            "Precondition: TH2 should have an ACL entry with the AuthMode as Group by TH1",
            cx => withChecks(cx, checks => run.grantGroupOperate(cx, "th2", GROUP_ID, TH2_ENDPOINT, checks)),
            {
                expected:
                    "TH2's ACL holds an entry with AuthMode Group whose subject is group 1, allowing OnOff on endpoint " +
                    "1. Both branches need it: JoinGroup is sent without UseAuxiliaryACL, so it adds no access entry.",
            },
        )
        .step(
            5,
            "If the Groupcast cluster is enabled on the RootNode endpoint, skip to step 9a. Otherwise, TH1 generates a " +
                'random key (Key1) and EpochKey0 and uses GroupID 1, GroupName "", and GroupKeySetID 0x01a1',
            chooseBranch,
            {
                expected:
                    "TH1 reads the root ServerList of the DUT and TH2, which agree on whether the Groupcast cluster is " +
                    "there, and that decides the branch; it is the branch this run's devices were chosen for. TH1 " +
                    "generates Key1 either way, because steps 9b and 12 send it too. The key is produced in-process " +
                    "and recorded as no check; the devices' logs show it where KeySetWrite or JoinGroup carries it.",
            },
        )
        .step(
            6,
            "TH1 sends KeySetWrite command to GroupKeyManagement cluster to TH2 on Endpoint 0 with GroupKeySetID " +
                "0x01a1, Key1, and EpochKey0",
            on("legacy", cx => withChecks(cx, checks => run.keySetWrite(cx, "th2", requireKeySet(), checks))),
            { expected: "TH2 receives the KeySetWrite command from the TH1." },
        )
        .step(
            7,
            "TH1 binds GroupId 1 with GroupKeySetID 0x01a1 in the GroupKeyMap attribute list on GroupKeyManagement " +
                "cluster to TH2 on Endpoint 0",
            on("legacy", cx =>
                withChecks(cx, checks => run.groupKeyMap(cx, "th2", GROUP_ID, GROUP_KEY_SET_ID, checks)),
            ),
            { expected: "TH2 receives the binding of GroupKeySetID with the GroupID from TH1." },
        )
        .step(
            8,
            "TH1 sends AddGroup with GroupID 1 Command to TH2 on Endpoint 1",
            on("legacy", cx => withChecks(cx, checks => run.addGroup(cx, "th2", GROUP_ID, TH2_ENDPOINT, checks))),
            { expected: "TH2 receives the AddGroup command from the TH1." },
        )
        .step(
            "9a",
            "If the Groupcast cluster is NOT enabled on the RootNode endpoint, skip to step 10. Otherwise, TH1 reads " +
                "the DUT Groupcast featuremap attribute",
            on("groupcast", cx => withChecks(cx, checks => run.groupcastSender(cx, "dut", checks))),
            { expected: "TH1 receives the featuremap attribute and verify that Sender feature (bit 1) is set." },
        )
        .step(
            "9b",
            "TH1 sends Groupcast JoinGroup command with GroupID = 1, Endpoints = [EP1], KeySetID = 0x01a1, Key = Key1 " +
                "to TH2 endpoint 0",
            on("groupcast", cx =>
                withChecks(cx, checks =>
                    run.joinGroup(
                        cx,
                        "th2",
                        { group: GROUP_ID, endpoints: [TH2_ENDPOINT], keySet: requireKeySet() },
                        checks,
                    ),
                ),
            ),
            { expected: "TH2 responds with SUCCESS." },
        )
        .step(
            10,
            "TH1 writes Binding entry into DUT with Entry 1: Group = 1",
            run.writeBindingStep("dut", [{ group: GROUP_ID }]),
            {
                expected: "The DUT accepts the write and holds the group entry.",
            },
        )
        .step(
            11,
            "If the Groupcast cluster is enabled on the RootNode endpoint, skip this step. Otherwise, TH1 sets up group " +
                "settings on DUT",
            on("legacy", cx =>
                withChecks(cx, async checks => {
                    await run.keySetWrite(cx, "dut", requireKeySet(), checks);
                    await run.groupKeyMap(cx, "dut", GROUP_ID, GROUP_KEY_SET_ID, checks);
                }),
            ),
            {
                expected:
                    "The DUT accepts Key1 under GroupKeySetID 0x01a1 and the GroupKeyMap entry binding group 1 to it, " +
                    "which is what a sender needs; step 14a shows it using them. It needs no group membership: that " +
                    "is for receiving.",
            },
        )
        .step(
            12,
            "If the Groupcast cluster is NOT enabled on the RootNode endpoint, skip this step. Otherwise, TH1 sends " +
                "Groupcast JoinGroup command with GroupID = 1, Endpoints = [], KeySetID = 0x01a1, Key = Key1 to the " +
                "DUT endpoint 0",
            on("groupcast", cx =>
                withChecks(cx, checks =>
                    run.joinGroup(cx, "dut", { group: GROUP_ID, endpoints: [], keySet: requireKeySet() }, checks),
                ),
            ),
            { expected: "DUT responds with SUCCESS." },
        )
        .step(
            "13a",
            "TH1 sends a unicast Off command to TH2 (Endpoint 1)",
            cx =>
                withChecks(cx, async checks => {
                    const th2 = cx.devices.th2;
                    const from = await th2.log.markSettled();
                    const off = await attempt(
                        () => run.node(cx, "th2", "TH1 sends Off to TH2").invoke("OnOff", "off", {}, TH2_ENDPOINT),
                        () => "TH2 answered Off with SUCCESS",
                    );
                    checks.push({ what: "Off to TH2", check: () => off.check });

                    const logged = await receivedUnicast(th2, TH2_ENDPOINT, OFF_COMMAND, from);
                    checks.push({ what: "TH2 received Off on endpoint 1", check: () => logged });
                }),
            { pics: "OO.C.C00.Tx", expected: "TH2 responds with SUCCESS." },
        )
        .step("13b", "TH1 reads OnOff attribute from TH2 (Endpoint 1)", run.readOnOffStep("th2", TH2_ENDPOINT, false), {
            pics: "OO.C.C01.Tx",
            expected: "Verify that the value is set to Off.",
        })
        .step(
            "14a",
            "DUT is triggered to send Multicast message On command to its binding entries",
            groupOnReachesTh2,
            {
                pics: "OO.C.C01.Tx",
                expected:
                    "TH2 receives On command (Endpoint 1). The DUT's own log shows OnOff.on sent as a group message for " +
                    "group 1 to the address the branch calls for, and TH2's shows it receiving group 1's command and " +
                    "dispatching it to endpoint 1.",
            },
        )
        .step("14b", "TH1 reads OnOff attribute from TH2 (Endpoint 1)", run.readOnOffStep("th2", TH2_ENDPOINT, true), {
            pics: "OO.C.C01.Tx",
            expected: "Verify that the value is set to On.",
        })
        .step(15, "TH1 removes all the binding entries from DUT", run.writeBindingStep("dut", []), {
            expected: "The DUT accepts the write and holds no binding entry.",
        })
        .step(
            "16a",
            "DUT is triggered to send Multicast message off command to its binding entries",
            cx =>
                withChecks(cx, async checks => {
                    const { dut, th2 } = cx.devices;
                    const from = await th2.log.markSettled();

                    const sent = await trigger(dut, "off");
                    checks.push({ what: "The DUT's trigger", check: () => sent.check });

                    const none = await expectNoCommandInvoke(
                        th2.log,
                        th2.flavor,
                        TH2_ENDPOINT,
                        ON_OFF_ID,
                        OFF_COMMAND,
                        from,
                        ABSENCE_WINDOW,
                        GROUP_ID,
                    );
                    checks.push({ what: "TH2 received no Off on endpoint 1", check: () => none });
                }),
            { pics: "OO.C.C00.Tx", expected: "TH2 does not receive Off command." },
        )
        .step("16b", "TH1 reads OnOff attribute from TH2 (Endpoint 1)", run.readOnOffStep("th2", TH2_ENDPOINT, true), {
            pics: "OO.C.C01.Tx",
            expected: "Verify that the value is set to On.",
        })
        .finalize(cx => run.finalize(cx, "dut"));
}

tcBind23("TC-BIND-2.3-Groupcast", { dut: "light-switch", th2: "all-clusters" }, "groupcast");

tcBind23("TC-BIND-2.3-NoGroupcast", { dut: "light-switch-no-groupcast", th2: "all-clusters-no-groupcast" }, "legacy");
