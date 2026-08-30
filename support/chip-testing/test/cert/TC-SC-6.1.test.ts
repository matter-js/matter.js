/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeApi, CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { CommandFieldValue } from "./tc-support.js";
import {
    answersWithStatus,
    CertCheckFailedError,
    CommissionedRefs,
    describeValue,
    expectCommandInvoke,
    expectMessageWithPath,
    LOG_TIMEOUT,
    record,
    requireId,
    responseStatusOf,
} from "./tc-support.js";

const GROUP_KEY_MANAGEMENT = Matter.clusters.require("GroupKeyManagement");
const GROUPS = Matter.clusters.require("Groups");
const ACCESS_CONTROL = Matter.clusters.require("AccessControl");

const GROUP_KEY_MANAGEMENT_ID = requireId(GROUP_KEY_MANAGEMENT.id, "GroupKeyManagement cluster");
const GROUPS_ID = requireId(GROUPS.id, "Groups cluster");
const ACCESS_CONTROL_ID = requireId(ACCESS_CONTROL.id, "AccessControl cluster");

/** GroupKeyManagement and AccessControl are root-node clusters; Groups lives on the on/off light. */
const ROOT_ENDPOINT = 0;
const GROUPS_ENDPOINT = 1;

const GROUP = { id: 1, name: "GroupOne" };
const GROUP_KEY_SET_ID = 1;

/** The fabric's own IPK key set, which commissioning writes and no step removes (Matter Core § 11.2.2). */
const IPK_KEY_SET_ID = 0;

/** The Groups feature that decides whether a `ViewGroupResponse` may answer with an empty name. */
const GROUP_NAMES_PROPERTY = "groupNames";
const GROUP_NAMES_FEATURE = 1 << 0;

/** `AccessControlEntryPrivilegeEnum.Operate` and `AccessControlEntryAuthModeEnum.Group`. */
const PRIVILEGE_OPERATE = 3;
const AUTH_MODE_GROUP = 3;

const commissioned = new CommissionedRefs();

function attributeId(cluster: typeof GROUP_KEY_MANAGEMENT, attributeName: string): number {
    return requireId(cluster.attributes.require(attributeName).id, `${cluster.name}.${attributeName}`);
}

/**
 * The key set the DUT writes, in the shape the plan's step 1b describes. The start time is a Unix
 * timestamp rather than the plan's own literal, for the reason AGENTS.md records under "An `epoch-us`
 * cannot carry the plan's literal start time"; nothing here depends on its value.
 */
function groupKeySet() {
    return {
        groupKeySetId: GROUP_KEY_SET_ID,
        groupKeySecurityPolicy: 0,
        epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
        epochStartTime0: 1_600_000_000_000_000n,
        epochKey1: null,
        epochStartTime1: null,
        epochKey2: null,
        epochStartTime2: null,
    };
}

/**
 * Invokes a command on the TH and verifies the TH's own log recorded it with the fields sent. A
 * response carrying its own status is checked separately, since a command the cluster refused still
 * resolves.
 */
async function invokeAndCheck(
    cx: CertStepContext,
    ref: CertNodeRef,
    cluster: typeof GROUP_KEY_MANAGEMENT,
    clusterId: number,
    endpoint: number,
    commandName: string,
    args: object,
    fields: CommandFieldValue[],
): Promise<unknown> {
    const th = cx.devices.th;
    const from = th.log.mark();

    let response: unknown;
    try {
        response = await cx.controllers.dut.node(ref).invoke(cluster.name, commandName, args, endpoint);
    } catch (e) {
        cx.recorder.check({ type: "response", verdict: "fail", detail: String(e) });
        throw e;
    }
    cx.recorder.check({
        type: "response",
        verdict: "pass",
        detail: response === undefined ? "status=Success" : `status=Success, response=${describeValue(response)}`,
    });

    if (answersWithStatus(cluster, commandName)) {
        const payloadStatus = responseStatusOf(response);
        record(
            cx,
            {
                type: "response",
                verdict: payloadStatus === 0 ? "pass" : "fail",
                detail:
                    payloadStatus === undefined
                        ? `${commandName} answered ${describeValue(response)}, which carries no status`
                        : `${commandName} response status=${payloadStatus}`,
            },
            `${cluster.name}.${commandName} response status`,
        );
    }

    const logCheck = await expectCommandInvoke(
        th.log,
        th.flavor,
        endpoint,
        clusterId,
        requireId(cluster.commands.require(commandName).id, `${cluster.name}.${commandName}`),
        fields,
        from,
        LOG_TIMEOUT,
    );
    record(cx, logCheck, `CommandDataIB log for ${cluster.name}.${commandName}`);

    return response;
}

/**
 * Whether the TH's Groups cluster keeps group names. A feature map is a bitmap, and both adapters
 * decode a bitmap through the model into an object of named bits rather than the raw number.
 */
async function keepsGroupNames(node: CertNodeApi): Promise<boolean> {
    const value = await node.readAttribute({
        endpoint: GROUPS_ENDPOINT,
        cluster: GROUPS_ID,
        attribute: attributeId(GROUPS, "featureMap"),
    });
    if (typeof value === "number") {
        return (value & GROUP_NAMES_FEATURE) !== 0;
    }
    if (typeof value === "object" && value !== null && GROUP_NAMES_PROPERTY in value) {
        return Boolean(value[GROUP_NAMES_PROPERTY]);
    }
    throw new CertCheckFailedError(
        `TH answered Groups FeatureMap with ${describeValue(value)}, which names no features`,
    );
}

/** The ACL the TH already holds for this fabric, which a new entry is appended to rather than replacing. */
async function readAcl(node: CertNodeApi): Promise<unknown[]> {
    const value = await node.readAttribute({
        endpoint: ROOT_ENDPOINT,
        cluster: ACCESS_CONTROL_ID,
        attribute: attributeId(ACCESS_CONTROL, "acl"),
    });
    if (!Array.isArray(value)) {
        throw new CertCheckFailedError(`TH answered its ACL with ${describeValue(value)}, not a list`);
    }
    return value;
}

/**
 * Whether an ACL entry admits this group — what step 1a asks the DUT to put in place. A subject is a
 * uint64, so it reaches here as a `bigint` on one controller and a `number` on another; the comparison
 * is on the value, not the type.
 */
function isGroupEntry(entry: unknown): boolean {
    if (typeof entry !== "object" || entry === null) {
        return false;
    }
    const { authMode, subjects } = entry as { authMode?: unknown; subjects?: unknown };
    if (Number(authMode) !== AUTH_MODE_GROUP || !Array.isArray(subjects)) {
        return false;
    }
    return subjects.some(subject => {
        const value = typeof subject === "bigint" || typeof subject === "number" ? Number(subject) : undefined;
        return value === GROUP.id;
    });
}

certTest("TC-SC-6.1", {
    plan: "group_communication.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "GRPKEY.C"],
    app: "all-clusters",
})
    .step(
        "1a",
        "TH should have the ACL entry with the AuthMode as Group by DUT",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const node = dut.node(ref);

            // The DUT's own administer entry is in this list; writing the group entry alone would
            // revoke the access every later step needs.
            const existing = await readAcl(node);
            await node.writeAttribute(
                { endpoint: ROOT_ENDPOINT, cluster: ACCESS_CONTROL_ID, attribute: attributeId(ACCESS_CONTROL, "acl") },
                [
                    ...existing,
                    { privilege: PRIVILEGE_OPERATE, authMode: AUTH_MODE_GROUP, subjects: [GROUP.id], targets: null },
                ],
            );

            const readBack = await readAcl(node);
            record(
                cx,
                {
                    type: "response",
                    verdict: readBack.some(isGroupEntry) ? "pass" : "fail",
                    detail: `ACL holds ${readBack.length} entries, ${
                        readBack.some(isGroupEntry) ? "one of them admitting" : "none admitting"
                    } group ${GROUP.id}`,
                },
                "the TH's ACL admits the group the DUT is about to add it to",
            );
        },
        {
            expected:
                "The TH's ACL carries an entry whose AuthMode is Group and whose subjects name the group, alongside " +
                "the administer entry the DUT itself uses.",
        },
    )
    .step(
        "1b",
        "DUT generates a random key and EpochKey0 assigned to GroupKeySetID 1, with " +
            "GroupKeySecurityPolicy TrustFirst and an EpochStartTime0",
        async cx => {
            const set = groupKeySet();
            record(
                cx,
                {
                    type: "response",
                    verdict:
                        set.groupKeySetId === GROUP_KEY_SET_ID &&
                        set.groupKeySecurityPolicy === 0 &&
                        set.epochKey0 !== undefined
                            ? "pass"
                            : "fail",
                    detail:
                        `key set ${set.groupKeySetId}, policy TrustFirst(${set.groupKeySecurityPolicy}), ` +
                        `EpochKey0 ${Bytes.toHex(set.epochKey0)}, EpochStartTime0 ${set.epochStartTime0}`,
                },
                "the key material the next step writes",
            );
        },
        {
            expected:
                "The DUT holds a key set the next step can write. This step produces the artifact in-process, so it " +
                "is not evidence about the TH.",
        },
    )
    .step(
        2,
        "DUT sends KeySetWrite command to GroupKeyManagement cluster to TH on EP0",
        commissioned.withRef("dut", async (cx, ref) => {
            await invokeAndCheck(
                cx,
                ref,
                GROUP_KEY_MANAGEMENT,
                GROUP_KEY_MANAGEMENT_ID,
                ROOT_ENDPOINT,
                "keySetWrite",
                { groupKeySet: groupKeySet() },
                [],
            );
        }),
        {
            pics: "GRPKEY.C.C00.Tx",
            expected: "Test Harness receives the KeySetWrite command from the DUT.",
        },
    )
    .step(
        3,
        "DUT binds GroupID 1 with GroupKeySetID 1 in the GroupKeyMap attribute list on GroupKeyManagement cluster",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const from = th.log.mark();
            const path = {
                endpoint: ROOT_ENDPOINT,
                cluster: GROUP_KEY_MANAGEMENT_ID,
                attribute: attributeId(GROUP_KEY_MANAGEMENT, "groupKeyMap"),
            };

            await cx.controllers.dut
                .node(ref)
                .writeAttribute(path, [{ groupId: GROUP.id, groupKeySetId: GROUP_KEY_SET_ID }]);
            cx.recorder.check({ type: "response", verdict: "pass", detail: "GroupKeyMap write accepted" });

            record(
                cx,
                await expectMessageWithPath(th.log, th.flavor, "write", path, from, LOG_TIMEOUT),
                "WriteRequestMessage log for GroupKeyManagement.groupKeyMap",
            );

            const readBack = await cx.controllers.dut.node(ref).readAttribute(path);
            const bound =
                Array.isArray(readBack) &&
                readBack.some(entry => {
                    if (typeof entry !== "object" || entry === null) {
                        return false;
                    }
                    const { groupId, groupKeySetId } = entry as { groupId?: unknown; groupKeySetId?: unknown };
                    return groupId === GROUP.id && groupKeySetId === GROUP_KEY_SET_ID;
                });
            record(
                cx,
                {
                    type: "response",
                    verdict: bound ? "pass" : "fail",
                    detail: `GroupKeyMap reads back as ${describeValue(readBack)}`,
                },
                "the binding the TH kept",
            );
        }),
        {
            pics: "GRPKEY.C.A0000",
            expected: "Test Harness receives the binding of GroupKeySetID 1 with the GroupID 1 from DUT.",
        },
    )
    .step(
        4,
        'DUT sends AddGroup Command to TH with the GroupID 1 and GroupName "GroupOne"',
        commissioned.withRef("dut", async (cx, ref) => {
            await invokeAndCheck(
                cx,
                ref,
                GROUPS,
                GROUPS_ID,
                GROUPS_ENDPOINT,
                "addGroup",
                { groupId: GROUP.id, groupName: GROUP.name },
                [
                    { id: 0, value: GROUP.id },
                    { id: 1, value: GROUP.name },
                ],
            );
        }),
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
