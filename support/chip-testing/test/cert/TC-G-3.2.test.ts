/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext, CheckRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { CommandFieldValue, InvokedCommand } from "./tc-support.js";
import { CommissionedRefs, invokeCommand, recordAll, requireId, withChecks } from "./tc-support.js";

const GROUPS = Matter.clusters.require("Groups");
const GROUP_KEY_MANAGEMENT = Matter.clusters.require("GroupKeyManagement");

/** The endpoint the plan calls `PIXIT.G.ENDPOINT`. Both THs host Groups and Identify on endpoint 1. */
const ENDPOINT = 1;

/** GroupKeyManagement is a root-node cluster, so its interactions go to endpoint 0 whatever `ENDPOINT` is. */
const ROOT_ENDPOINT = 0;

const GROUP_KEY_SET_ID = 1;

/** `GroupKeySecurityPolicyEnum.TrustFirst`, the policy the plan's preconditions name. */
const TRUST_FIRST = 0;

/** The group the DUT removes by id, and the one it adds back while the TH identifies. */
const REMOVED_GROUP = { id: 0x0002, name: "gp2" };
const IDENTIFYING_GROUP = { id: 0x0003, name: "gp3" };

/** Long enough that the TH is still identifying when `AddGroupIfIdentifying` reaches it. */
const IDENTIFY_TIME = 0x0078;

const commissioned = new CommissionedRefs();

/**
 * Has the DUT invoke `command` on the TH's Groups cluster; see {@link invokeCommand}.
 *
 * Unlike TC-ACT-3.2's bridge, this TH implements every command this TC sends, so a non-success status
 * is a failure of the test rather than tolerated evidence. `AddGroup` answering `UnsupportedAccess` is
 * how a group the fabric's key map does not name is refused, which is what the preconditions exist to
 * rule out.
 */
function invokeGroups(
    cx: CertStepContext,
    ref: CertNodeRef,
    command: string,
    args: object,
    fields: CommandFieldValue[],
): Promise<InvokedCommand> {
    return invokeCommand(cx, ref, { cluster: GROUPS, endpoint: ENDPOINT, command, args, fields });
}

/**
 * The key set the plan's preconditions have the DUT write, in chip's own worked epoch keys. All three
 * keys are written because the struct's `EpochKey1`/`EpochKey2` are mandatory.
 *
 * The start times are not the plan's literal 1/2220001/2220002: matter.js takes an `epoch-us` as a Unix
 * timestamp and refuses one already offset to the Matter epoch, so the times below are Unix
 * microseconds instead. Only their order matters here — the DUT never sends group traffic, so the
 * absolute times are not what any step rests on.
 */
function groupKeySet() {
    const start = 1_600_000_000_000_000n;
    return {
        groupKeySetId: GROUP_KEY_SET_ID,
        groupKeySecurityPolicy: TRUST_FIRST,
        epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
        epochStartTime0: start,
        epochKey1: Bytes.fromHex("d1d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
        epochStartTime1: start + 1_000_000n,
        epochKey2: Bytes.fromHex("d2d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
        epochStartTime2: start + 2_000_000n,
    };
}

/** The group ids a `GetGroupMembership` response carries, whatever shape the controller decoded it into. */
function groupsIn(response: unknown): number[] {
    if (typeof response !== "object" || response === null || !("groupList" in response)) {
        return [];
    }
    const { groupList } = response;
    return Array.isArray(groupList) ? groupList.filter(entry => typeof entry === "number") : [];
}

certTest("TC-G-3.2", {
    plan: "Groups.adoc",
    pics: ["G.C", "GRPKEY.C"],
    app: "all-clusters",

    // Binds a group key through GroupKeyMap, which an all-clusters build with Groupcast on refuses once Groups
    // reaches cluster revision 5.  Only this project's own build offers the variant with Groupcast off; the released
    // binaries predate the change and run the ordinary app.  A chip-docker image runs its own binary and can offer
    // neither, so it is left out
    appVariant: { matterjs: "nogroupcast" },
    flavors: ["chip-local", "matterjs"],
})
    .step(
        "0",
        "Preconditions: the DUT commissions the TH, writes a group key set to the TH's GroupKeyManagement " +
            "cluster, binds both group ids to it in GroupKeyMap, and adds both groups.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const node = dut.node(ref);
            await node.invoke("GroupKeyManagement", "keySetWrite", { groupKeySet: groupKeySet() }, ROOT_ENDPOINT);
            await node.writeAttribute(
                {
                    endpoint: ROOT_ENDPOINT,
                    cluster: requireId(GROUP_KEY_MANAGEMENT.id, "GroupKeyManagement cluster"),
                    attribute: requireId(
                        GROUP_KEY_MANAGEMENT.attributes.require("groupKeyMap").id,
                        "GroupKeyManagement.groupKeyMap",
                    ),
                },
                [REMOVED_GROUP, IDENTIFYING_GROUP].map(group => ({
                    groupId: group.id,
                    groupKeySetId: GROUP_KEY_SET_ID,
                })),
            );
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail:
                    `key set ${GROUP_KEY_SET_ID} written and bound to groups ` +
                    `${REMOVED_GROUP.id} and ${IDENTIFYING_GROUP.id}`,
            });

            // A group the fabric's GroupKeyMap does not name is refused, so these also prove the
            // binding above took: every later step rests on both groups existing on the TH.
            await withChecks(cx, async checks => {
                for (const group of [REMOVED_GROUP, IDENTIFYING_GROUP]) {
                    const added = await invokeGroups(
                        cx,
                        ref,
                        "addGroup",
                        { groupId: group.id, groupName: group.name },
                        [
                            { id: 0, value: group.id },
                            { id: 1, value: group.name },
                        ],
                    );
                    checks.push(...added.checks);
                }
            });
        },
        {
            expected:
                "The TH accepts the key set, the GroupKeyMap write and both AddGroup commands, so the DUT's " +
                "later commands act on groups the TH actually has.",
        },
    )
    .step(
        1,
        "DUT sends GetGroupMembership command to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            // An empty GroupList asks for every group the endpoint has for this fabric, which is what
            // makes the response name the two the preconditions added.
            const { response, checks } = await invokeGroups(cx, ref, "getGroupMembership", { groupList: [] }, []);

            if (response.ok) {
                const reported = groupsIn(response.value);
                const missing = [REMOVED_GROUP, IDENTIFYING_GROUP].filter(group => !reported.includes(group.id));
                const content: CheckRecord = {
                    type: "response",
                    verdict: missing.length === 0 ? "pass" : "fail",
                    detail:
                        missing.length === 0
                            ? `GetGroupMembershipResponse names groups ${reported.join(", ")}`
                            : `GetGroupMembershipResponse names groups ${reported.join(", ") || "none"}, ` +
                              `without ${missing.map(group => group.id).join(", ")}`,
                };
                checks.push({ what: "GetGroupMembershipResponse content", check: () => content });
            }

            await recordAll(cx, checks);
        }),
        { pics: "G.C.C02.Tx", expected: "Test Harness receives the GetGroupMembership command from the DUT." },
    )
    .step(
        2,
        "DUT sends RemoveGroup command to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const { checks } = await invokeGroups(cx, ref, "removeGroup", { groupId: REMOVED_GROUP.id }, [
                { id: 0, value: REMOVED_GROUP.id },
            ]);
            await recordAll(cx, checks);
        }),
        { pics: "G.C.C03.Tx", expected: "Test Harness receives the RemoveGroup command from the DUT." },
    )
    .step(
        3,
        "DUT sends RemoveAllGroups command to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const { checks } = await invokeGroups(cx, ref, "removeAllGroups", {}, []);
            await recordAll(cx, checks);
        }),
        { pics: "G.C.C04.Tx", expected: "Test Harness receives the RemoveAllGroups command from the DUT." },
    )
    .step(
        4,
        "DUT sends AddGroupIfIdentifying command to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            // The command is a no-op on a TH that is not identifying, so the plan's own procedure puts
            // the TH into identify mode first (chip's worked commands do the same).
            await cx.controllers.dut
                .node(ref)
                .invoke("Identify", "identify", { identifyTime: IDENTIFY_TIME }, ENDPOINT);
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: `Identify.identify identifyTime=${IDENTIFY_TIME} accepted`,
            });

            const { checks } = await invokeGroups(
                cx,
                ref,
                "addGroupIfIdentifying",
                { groupId: IDENTIFYING_GROUP.id, groupName: IDENTIFYING_GROUP.name },
                [
                    { id: 0, value: IDENTIFYING_GROUP.id },
                    { id: 1, value: IDENTIFYING_GROUP.name },
                ],
            );
            await recordAll(cx, checks);
        }),
        { pics: "G.C.C05.Tx", expected: "Test Harness receives the AddGroupIfIdentifying command from the DUT." },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
