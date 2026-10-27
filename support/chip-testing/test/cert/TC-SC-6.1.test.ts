/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CheckRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    aclAdmitsGroupStep,
    addGroupStep,
    attributeId,
    GROUP,
    GROUP_KEY_MANAGEMENT,
    GROUP_KEY_SET_ID,
    GROUPCAST,
    GROUPCAST_ID,
    GroupcastBranch,
    GROUPS,
    GROUPS_ENDPOINT,
    groupKeyMapStep,
    IPK_KEY_SET_ID,
    joinGroupStep,
    keepsGroupNames,
    keyMaterialStep,
    keySetWriteStep,
    listsJoinedGroup,
    ROOT_ENDPOINT,
} from "./tc-group-support.js";
import {
    attempt,
    CommissionedRefs,
    describeValue,
    expectAttributePathIB,
    invokeCommand,
    LOG_TIMEOUT,
    record,
    recordAll,
    theTh,
    withChecks,
} from "./tc-support.js";

const commissioned = new CommissionedRefs();

const branch = new GroupcastBranch();

/** The plan's step 7: the DUT reads back the TH's Groupcast membership, which must list what step 6 joined. */
const membershipReadStep = commissioned.withRef("dut", async (cx, ref) =>
    withChecks(cx, async checks => {
        const th = theTh(cx);
        const from = th.log.mark();
        const path = {
            endpoint: ROOT_ENDPOINT,
            cluster: GROUPCAST_ID,
            attribute: attributeId(GROUPCAST, "membership"),
        };

        const read = await attempt(
            () => cx.controllers.dut.node(ref).readAttribute(path),
            membership => `Membership reads as ${describeValue(membership)}`,
        );
        checks.push({ what: "Groupcast.membership read", check: () => read.check });

        const logged = await expectAttributePathIB(th.log, th.flavor, path, from, LOG_TIMEOUT);
        checks.push({ what: "ReadRequestMessage log for Groupcast.membership", check: () => logged });

        if (read.ok) {
            const lists = listsJoinedGroup(read.value);
            const joined: CheckRecord = {
                type: "response",
                verdict: lists ? "pass" : "fail",
                detail:
                    `Membership ${lists ? "lists" : "does not list"} group ${GROUP.id} on ` +
                    `endpoint ${GROUPS_ENDPOINT} with key set ${GROUP_KEY_SET_ID}`,
            };
            checks.push({ what: "the membership step 6 joined", check: () => joined });
        }
    }),
);

certTest("TC-SC-6.1", {
    plan: "group_communication.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "GRPKEY.C"],
    app: "all-clusters",

    // The plan's legacy steps run only against a TH without Groupcast on its root, and only this project's own chip
    // build offers that variant; the released binaries and matter.js's app take the Groupcast steps.  A chip-docker
    // image runs its own binary and cannot run the variant, so it is left out
    appVariant: { matterjs: "nogroupcast" },
    flavors: ["chip-local", "matterjs"],
})
    .step(
        "1a",
        "TH should have the ACL entry with the AuthMode as Group by DUT",
        async cx => {
            branch.reset();
            await aclAdmitsGroupStep(commissioned)(cx);
            record(
                cx,
                await branch.learn(cx.controllers.dut.node(commissioned.require("dut"))),
                "the TH's root decides the plan's branch",
            );
        },
        {
            expected:
                "The TH's ACL carries an entry whose AuthMode is Group and whose subjects name the group, alongside " +
                "the administer entry the DUT itself uses. The TH's root ServerList says which branch of the plan " +
                "applies.",
        },
    )
    .step(
        "1b",
        "DUT generates a random key and EpochKey0 assigned to GroupKeySetID 1, with " +
            "GroupKeySecurityPolicy TrustFirst and an EpochStartTime0",
        keyMaterialStep(),
        {
            expected:
                "The DUT holds a key set the next step can write. This step produces the artifact in-process, so it " +
                "is not evidence about the TH.",
        },
    )
    .step(
        2,
        "DUT sends KeySetWrite command to GroupKeyManagement cluster to TH on EP0",
        keySetWriteStep(commissioned),
        {
            pics: "GRPKEY.C.C00.Tx",
            expected: "Test Harness receives the KeySetWrite command from the DUT.",
        },
    )
    .step(
        3,
        "DUT binds GroupID 1 with GroupKeySetID 1 in the GroupKeyMap attribute list on GroupKeyManagement cluster",
        groupKeyMapStep(commissioned),
        {
            pics: "GRPKEY.C.A0000",
            notApplicableAtRun: branch.legacyStepsApply,
            expected: "Test Harness receives the binding of GroupKeySetID 1 with the GroupID 1 from DUT.",
        },
    )
    .step(
        4,
        'DUT sends AddGroup Command to TH with the GroupID 1 and GroupName "GroupOne"',
        addGroupStep(commissioned),
        {
            pics: "G.C.C00.Tx",
            notApplicableAtRun: branch.legacyStepsApply,
            expected: "Test Harness receives the AddGroup command from the DUT.",
        },
    )
    .step(
        5,
        "DUT sends ViewGroup command with the GroupID 1 to the Groups cluster on the TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const { response, accepted, checks } = await invokeCommand(cx, ref, {
                cluster: GROUPS,
                endpoint: GROUPS_ENDPOINT,
                command: "viewGroup",
                args: { groupId: GROUP.id },
                fields: [{ id: 0, value: GROUP.id }],
            });

            if (response.ok && accepted) {
                // The plan allows an empty name only from a TH without the GroupNames feature, so which
                // answer is acceptable is read from the TH rather than allowed unconditionally — both THs
                // configured here keep names, and an unconditional allowance could not fail for either.
                // The group id is not optional either: a response for another group would otherwise pass.
                const answer = response.value;
                const groupId =
                    typeof answer === "object" && answer !== null && "groupId" in answer ? answer.groupId : undefined;
                const groupName =
                    typeof answer === "object" && answer !== null && "groupName" in answer
                        ? answer.groupName
                        : undefined;
                const keepsNames = await attempt(
                    () => keepsGroupNames(cx.controllers.dut.node(ref)),
                    keeps => `the TH ${keeps ? "keeps" : "does not keep"} group names`,
                );
                let reported = keepsNames.check;
                if (keepsNames.ok) {
                    const named = groupName === GROUP.name || (!keepsNames.value && groupName === "");
                    reported = {
                        type: "response",
                        verdict: Number(groupId) === GROUP.id && named ? "pass" : "fail",
                        detail:
                            `ViewGroupResponse answers for group ${describeValue(groupId)} named ${describeValue(groupName)}; ` +
                            `the TH ${keepsNames.value ? "keeps" : "does not keep"} group names`,
                    };
                }
                checks.push({ what: "the group the TH reports, and its name", check: () => reported });
            }

            await recordAll(cx, checks);
        }),
        {
            pics: "G.C.C01.Tx",
            notApplicableAtRun: branch.legacyStepsApply,
            expected:
                "Test Harness receives the ViewGroup command and answers SUCCESS with GroupID 1 and GroupName " +
                '"GroupOne", or an empty name where it does not support the GroupNames feature.',
        },
    )
    .step(
        6,
        "DUT sends the Groupcast JoinGroup command to the TH on EP0 with GroupID 1, Endpoints [1] and KeySetID 1",
        joinGroupStep(commissioned),
        {
            notApplicableAtRun: branch.groupcastStepsApply,
            expected: "The TH accepts the JoinGroup command from the DUT.",
        },
    )
    .step(7, "DUT reads the Groupcast Membership attribute on the TH on EP0", membershipReadStep, {
        notApplicableAtRun: branch.groupcastStepsApply,
        expected:
            "Test Harness receives the Membership attribute read from the DUT. Beyond the plan, the membership must " +
            "list GroupID 1 on endpoint 1 with KeySetID 1, which shows step 6 took effect.",
    })
    .step(
        8,
        "DUT sends KeySetRead Command to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const { response, accepted, checks } = await invokeCommand(cx, ref, {
                cluster: GROUP_KEY_MANAGEMENT,
                endpoint: ROOT_ENDPOINT,
                command: "keySetRead",
                args: { groupKeySetId: GROUP_KEY_SET_ID },
                fields: [{ id: 0, value: GROUP_KEY_SET_ID }],
            });

            if (response.ok && accepted) {
                const answer = response.value;
                const read =
                    typeof answer === "object" && answer !== null && "groupKeySet" in answer
                        ? answer.groupKeySet
                        : undefined;
                const readId =
                    typeof read === "object" && read !== null && "groupKeySetId" in read
                        ? read.groupKeySetId
                        : undefined;
                const reported: CheckRecord = {
                    type: "response",
                    verdict: readId === GROUP_KEY_SET_ID ? "pass" : "fail",
                    detail: `KeySetReadResponse carries key set ${describeValue(readId)}`,
                };
                checks.push({ what: "the key set the TH reports back", check: () => reported });
            }

            await recordAll(cx, checks);
        }),
        {
            pics: "GRPKEY.C.C01.Tx",
            expected: "Test Harness receives the KeySetRead command from the DUT.",
        },
    )
    .step(
        9,
        "DUT sends KeySetRemove Command to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const { checks } = await invokeCommand(cx, ref, {
                cluster: GROUP_KEY_MANAGEMENT,
                endpoint: ROOT_ENDPOINT,
                command: "keySetRemove",
                args: { groupKeySetId: GROUP_KEY_SET_ID },
                fields: [{ id: 0, value: GROUP_KEY_SET_ID }],
            });
            await recordAll(cx, checks);
        }),
        {
            pics: "GRPKEY.C.C03.Tx",
            expected: "Test Harness receives the KeySetRemove command from the DUT.",
        },
    )
    .step(
        10,
        "DUT sends KeySetReadAllIndices Command to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const { response, accepted, checks } = await invokeCommand(cx, ref, {
                cluster: GROUP_KEY_MANAGEMENT,
                endpoint: ROOT_ENDPOINT,
                command: "keySetReadAllIndices",
                args: {},
                fields: [],
            });

            if (response.ok && accepted) {
                // The set removed in step 9 must be gone from the indices, which is what tells that command
                // apart from one the TH merely answered.
                const answer = response.value;
                const indices =
                    typeof answer === "object" && answer !== null && "groupKeySetIds" in answer
                        ? answer.groupKeySetIds
                        : undefined;
                // Exactly the IPK, not merely "without the removed set": an empty list, or one naming a set
                // nobody wrote, would satisfy the weaker claim while saying the TH lost track of its keys.
                const listed = Array.isArray(indices) ? indices.map(Number) : undefined;
                const onlyIpk = listed !== undefined && listed.length === 1 && listed[0] === IPK_KEY_SET_ID;
                const reported: CheckRecord = {
                    type: "response",
                    verdict: onlyIpk ? "pass" : "fail",
                    detail:
                        `KeySetReadAllIndicesResponse lists ${describeValue(indices)}; after removing ` +
                        `${GROUP_KEY_SET_ID} only the IPK's ${IPK_KEY_SET_ID} may remain`,
                };
                checks.push({ what: "the indices the TH reports after the removal", check: () => reported });
            }

            await recordAll(cx, checks);
        }),
        {
            pics: "GRPKEY.C.C04.Tx",
            expected: "Test Harness receives the KeySetReadAllIndices command from the DUT.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
