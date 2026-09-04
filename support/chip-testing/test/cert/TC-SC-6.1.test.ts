/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { certTest } from "@matter/testing";
import {
    aclAdmitsGroupStep,
    addGroupStep,
    GROUP,
    GROUP_KEY_MANAGEMENT,
    GROUP_KEY_MANAGEMENT_ID,
    GROUP_KEY_SET_ID,
    GROUPS,
    GROUPS_ENDPOINT,
    GROUPS_ID,
    groupKeyMapStep,
    invokeAndCheck,
    IPK_KEY_SET_ID,
    keepsGroupNames,
    keyMaterialStep,
    keySetWriteStep,
    ROOT_ENDPOINT,
} from "./tc-group-support.js";
import { CommissionedRefs, describeValue, record } from "./tc-support.js";

const commissioned = new CommissionedRefs();

certTest("TC-SC-6.1", {
    plan: "group_communication.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "GRPKEY.C"],
    app: "all-clusters",
})
    .step("1a", "TH should have the ACL entry with the AuthMode as Group by DUT", aclAdmitsGroupStep(commissioned), {
        expected:
            "The TH's ACL carries an entry whose AuthMode is Group and whose subjects name the group, alongside " +
            "the administer entry the DUT itself uses.",
    })
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
            expected: "Test Harness receives the binding of GroupKeySetID 1 with the GroupID 1 from DUT.",
        },
    )
    .step(
        4,
        'DUT sends AddGroup Command to TH with the GroupID 1 and GroupName "GroupOne"',
        addGroupStep(commissioned),
        {
            pics: "G.C.C00.Tx",
            expected: "Test Harness receives the AddGroup command from the DUT.",
        },
    )
    .step(
        5,
        "DUT sends ViewGroup command with the GroupID 1 to the Groups cluster on the TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const response = await invokeAndCheck(
                cx,
                ref,
                GROUPS,
                GROUPS_ID,
                GROUPS_ENDPOINT,
                "viewGroup",
                { groupId: GROUP.id },
                [{ id: 0, value: GROUP.id }],
            );

            // The plan allows an empty name only from a TH without the GroupNames feature, so which
            // answer is acceptable is read from the TH rather than allowed unconditionally — both THs
            // configured here keep names, and an unconditional allowance could not fail for either.
            // The group id is not optional either: a response for another group would otherwise pass.
            const { groupId, groupName } =
                typeof response === "object" && response !== null
                    ? (response as { groupId?: unknown; groupName?: unknown })
                    : {};
            const keepsNames = await keepsGroupNames(cx.controllers.dut.node(ref));
            const named = groupName === GROUP.name || (!keepsNames && groupName === "");
            record(
                cx,
                {
                    type: "response",
                    verdict: Number(groupId) === GROUP.id && named ? "pass" : "fail",
                    detail:
                        `ViewGroupResponse answers for group ${describeValue(groupId)} named ${describeValue(groupName)}; ` +
                        `the TH ${keepsNames ? "keeps" : "does not keep"} group names`,
                },
                "the group the TH reports, and its name",
            );
        }),
        {
            pics: "G.C.C01.Tx",
            expected:
                "Test Harness receives the ViewGroup command and answers SUCCESS with GroupID 1 and GroupName " +
                '"GroupOne", or an empty name where it does not support the GroupNames feature.',
        },
    )
    .step(6, "DUT sends Groupcast JoinGroup command to the TH on EP0", async () => {}, {
        notApplicable:
            "The plan skips this where the TH's root endpoint has no Groupcast cluster, and neither TH has " +
            "one: matter.js's all-clusters device registers none and chip's all-clusters ZAP enables none.",
    })
    .step(7, "DUT reads the Groupcast membership attribute on the TH on EP0", async () => {}, {
        notApplicable: "Reads the cluster step 6 would have joined through, which neither TH has.",
    })
    .step(
        8,
        "DUT sends KeySetRead Command to TH",
        commissioned.withRef("dut", async (cx, ref) => {
            const response = await invokeAndCheck(
                cx,
                ref,
                GROUP_KEY_MANAGEMENT,
                GROUP_KEY_MANAGEMENT_ID,
                ROOT_ENDPOINT,
                "keySetRead",
                { groupKeySetId: GROUP_KEY_SET_ID },
                [{ id: 0, value: GROUP_KEY_SET_ID }],
            );

            const read =
                typeof response === "object" && response !== null && "groupKeySet" in response
                    ? (response as { groupKeySet?: { groupKeySetId?: unknown } }).groupKeySet
                    : undefined;
            record(
                cx,
                {
                    type: "response",
                    verdict: read?.groupKeySetId === GROUP_KEY_SET_ID ? "pass" : "fail",
                    detail: `KeySetReadResponse carries key set ${describeValue(read?.groupKeySetId)}`,
                },
                "the key set the TH reports back",
            );
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
            await invokeAndCheck(
                cx,
                ref,
                GROUP_KEY_MANAGEMENT,
                GROUP_KEY_MANAGEMENT_ID,
                ROOT_ENDPOINT,
                "keySetRemove",
                { groupKeySetId: GROUP_KEY_SET_ID },
                [{ id: 0, value: GROUP_KEY_SET_ID }],
            );
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
            const response = await invokeAndCheck(
                cx,
                ref,
                GROUP_KEY_MANAGEMENT,
                GROUP_KEY_MANAGEMENT_ID,
                ROOT_ENDPOINT,
                "keySetReadAllIndices",
                {},
                [],
            );

            // The set removed in step 9 must be gone from the indices, which is what tells that command
            // apart from one the TH merely answered.
            const indices =
                typeof response === "object" && response !== null && "groupKeySetIDs" in response
                    ? (response as { groupKeySetIDs?: unknown }).groupKeySetIDs
                    : undefined;
            // Exactly the IPK, not merely "without the removed set": an empty list, or one naming a set
            // nobody wrote, would satisfy the weaker claim while saying the TH lost track of its keys.
            const listed = Array.isArray(indices) ? indices.map(Number) : undefined;
            const onlyIpk = listed !== undefined && listed.length === 1 && listed[0] === IPK_KEY_SET_ID;
            record(
                cx,
                {
                    type: "response",
                    verdict: onlyIpk ? "pass" : "fail",
                    detail:
                        `KeySetReadAllIndicesResponse lists ${describeValue(indices)}; after removing ` +
                        `${GROUP_KEY_SET_ID} only the IPK's ${IPK_KEY_SET_ID} may remain`,
                },
                "the indices the TH reports after the removal",
            );
        }),
        {
            pics: "GRPKEY.C.C04.Tx",
            expected: "Test Harness receives the KeySetReadAllIndices command from the DUT.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
