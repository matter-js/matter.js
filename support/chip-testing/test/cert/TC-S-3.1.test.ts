/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { CommandFieldValue, InvokedCommand, RecordedCheck } from "./tc-support.js";
import type { LogExpectClaim } from "./tc-support.js";
import {
    CommissionedRefs,
    expectSequence,
    invokeCommand,
    LOG_TIMEOUT,
    record,
    recordAll,
    requireId,
    responseStatusOf,
    withChecks,
} from "./tc-support.js";

const SCENES = Matter.clusters.require("ScenesManagement");
const GROUP_KEY_MANAGEMENT = Matter.clusters.require("GroupKeyManagement");

/** Both THs put ScenesManagement and Groups on the on/off light at endpoint 1. */
const ENDPOINT = 1;

/** GroupKeyManagement is a root-node cluster, so its interactions go to endpoint 0. */
const ROOT_ENDPOINT = 0;

/** The plan's own `GroupKeySetID` and G₁. */
const GROUP_KEY_SET_ID = 0x01a1;
const GROUP = { id: 0x0001, name: "gp1" };

const SCENE_ID = 0x01;
const COPIED_SCENE_ID = 0x02;
const SCENE_NAME = "scene1";

/**
 * The scene's stored state, which the plan names as ID 4's shape: a list of `ExtensionFieldSetStruct`,
 * each a `ClusterID` and an `AttributeValueList`. OnOff's `OnOff` attribute is the one both THs carry
 * on this endpoint, so the set the DUT sends is one a TH could actually apply.
 */
const ON_OFF_CLUSTER_ID = requireId(Matter.clusters.require("OnOff").id, "OnOff cluster");
const ON_OFF_ATTRIBUTE_ID = requireId(Matter.clusters.require("OnOff").attributes.require("onOff").id, "OnOff.onOff");
const SCENE_ON_OFF_VALUE = 1;

const EXTENSION_FIELD_SETS = [
    {
        clusterId: ON_OFF_CLUSTER_ID,
        attributeValueList: [{ attributeId: ON_OFF_ATTRIBUTE_ID, valueUnsigned8: SCENE_ON_OFF_VALUE }],
    },
];

/** Well inside the field's `max 60,000,000` (§ 1.4.9.2), and small enough to leave no transition running. */
const TRANSITION_TIME = 0;

const commissioned = new CommissionedRefs();

/**
 * The key set the plan's preconditions have the DUT write. The start times are not the plan's literal
 * 1110000/1110001: matter.js reads an `epoch-us` as a Unix timestamp and refuses one already offset to
 * the Matter epoch (see AGENTS.md, "An `epoch-us` cannot carry the plan's literal start time"). Only
 * their order matters here, since nothing in this TC sends group traffic.
 */
function groupKeySet() {
    const start = 1_600_000_000_000_000n;
    return {
        groupKeySetId: GROUP_KEY_SET_ID,
        groupKeySecurityPolicy: 0,
        epochKey0: Bytes.fromHex("a0a1a2a3a4a5a6a7a8a9aaabacadaeaf"),
        epochStartTime0: start,
        epochKey1: Bytes.fromHex("b0b1b2b3b4b5b6b7b8b9babbbcbdbebf"),
        epochStartTime1: start + 1_000_000n,
        epochKey2: null,
        epochStartTime2: null,
    };
}

/**
 * Has the DUT invoke `command` on the TH's ScenesManagement cluster; see {@link invokeCommand}.
 *
 * Every ScenesManagement command in this TC but `RecallScene` answers with a status inside its
 * response payload, which is checked as a claim of its own.
 */
function invokeScenes(
    cx: CertStepContext,
    ref: CertNodeRef,
    command: string,
    args: object,
    fields: CommandFieldValue[],
): Promise<InvokedCommand> {
    return invokeCommand(cx, ref, { cluster: SCENES, endpoint: ENDPOINT, command, args, fields });
}

/**
 * Checks a payload the per-field matcher cannot state: it matches one line per field, and a list or a
 * bitmap is neither one line on chip nor a plain integer on matter.js. The two flavors are given their
 * own lines rather than the field's value, since they do not merely format it differently — chip
 * numbers the nested fields and matter.js names them.
 */
async function expectPayloadLines(
    cx: CertStepContext,
    from: number,
    label: string,
    claim: LogExpectClaim,
): Promise<RecordedCheck> {
    const th = cx.devices.th;
    const check = await expectSequence(th.log, th.flavor, label, claim, from, LOG_TIMEOUT);
    return { what: label, check: () => check };
}

certTest("TC-S-3.1", {
    plan: "scenes.adoc",
    pics: ["S.C"],
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
        "Preconditions: the DUT commissions the TH, writes the plan's group key set, binds G1 to it in " +
            "GroupKeyMap, clears the TH's groups and adds G1.",
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
                [{ groupId: GROUP.id, groupKeySetId: GROUP_KEY_SET_ID }],
            );

            await node.invoke("Groups", "removeAllGroups", {}, ENDPOINT);

            // A group the fabric's GroupKeyMap does not name is refused, so this answer is what proves
            // the binding above took — every scene command below names this group.
            const added = await node.invoke(
                "Groups",
                "addGroup",
                { groupId: GROUP.id, groupName: GROUP.name },
                ENDPOINT,
            );
            const addStatus = responseStatusOf(added);
            record(
                cx,
                {
                    type: "response",
                    verdict: addStatus === 0 ? "pass" : "fail",
                    detail:
                        addStatus === undefined
                            ? `AddGroup answered ${JSON.stringify(added)}, which carries no status`
                            : `AddGroup response status=${addStatus}, group ${GROUP.id} bound to key set ` +
                              `0x${GROUP_KEY_SET_ID.toString(16)}`,
                },
                `Groups.addGroup response status`,
            );
        },
        {
            expected:
                "The TH accepts the key set, the GroupKeyMap write and AddGroup, so every scene command below " +
                "names a group the TH actually has.",
        },
    )
    .step(
        1,
        "DUT issues an AddScene command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) =>
            withChecks(cx, async checks => {
                const invoked = await invokeScenes(
                    cx,
                    ref,
                    "addScene",
                    {
                        groupId: GROUP.id,
                        sceneId: SCENE_ID,
                        transitionTime: TRANSITION_TIME,
                        sceneName: SCENE_NAME,
                        extensionFieldSetStructs: EXTENSION_FIELD_SETS,
                    },
                    [
                        { id: 0, value: GROUP.id },
                        { id: 1, value: SCENE_ID },
                        { id: 2, value: TRANSITION_TIME },
                        { id: 3, value: SCENE_NAME },
                    ],
                );
                checks.push(...invoked.checks);

                const payload = await expectPayloadLines(cx, invoked.from, "AddScene ExtensionFieldSetStructs (ID 4)", {
                    chip: {
                        ordered: [
                            /0x4 = \[\s*$/,
                            new RegExp(`0x0 = ${ON_OFF_CLUSTER_ID} \\(unsigned\\),`),
                            /0x1 = \[\s*$/,
                            new RegExp(`0x0 = ${ON_OFF_ATTRIBUTE_ID} \\(unsigned\\),`),
                            new RegExp(`0x1 = ${SCENE_ON_OFF_VALUE} \\(unsigned\\),`),
                        ],
                    },
                    matterjs: [
                        new RegExp(
                            `extensionFieldSetStructs: \\{ clusterId: ${ON_OFF_CLUSTER_ID}, attributeValueList: ` +
                                `\\[ \\{ attributeId: ${ON_OFF_ATTRIBUTE_ID}, valueUnsigned8: ${SCENE_ON_OFF_VALUE} \\} \\]`,
                        ),
                    ],
                });
                checks.push(payload);
            }),
        ),
        {
            pics: "S.C.C00.Tx",
            expected:
                "Test Harness receives the AddScene command from the DUT, carrying GroupID, SceneID, " +
                "TransitionTime, SceneName and an ExtensionFieldSetStructs list whose ClusterID and " +
                "AttributeValueList the TH's log shows.",
        },
    )
    .step(
        2,
        "DUT issues a ViewScene command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) => {
            const { checks } = await invokeScenes(cx, ref, "viewScene", { groupId: GROUP.id, sceneId: SCENE_ID }, [
                { id: 0, value: GROUP.id },
                { id: 1, value: SCENE_ID },
            ]);
            await recordAll(cx, checks);
        }),
        {
            pics: "S.C.C01.Tx",
            expected: "Test Harness receives the ViewScene command from the DUT, carrying GroupID and SceneID.",
        },
    )
    .step(
        3,
        "DUT issues a RemoveScene command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) => {
            const { checks } = await invokeScenes(cx, ref, "removeScene", { groupId: GROUP.id, sceneId: SCENE_ID }, [
                { id: 0, value: GROUP.id },
                { id: 1, value: SCENE_ID },
            ]);
            await recordAll(cx, checks);
        }),
        {
            pics: "S.C.C02.Tx",
            expected: "Test Harness receives the RemoveScene command from the DUT, carrying GroupID and SceneID.",
        },
    )
    .step(
        4,
        "DUT issues a RemoveAllScenes command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) => {
            const { checks } = await invokeScenes(cx, ref, "removeAllScenes", { groupId: GROUP.id }, [
                { id: 0, value: GROUP.id },
            ]);
            await recordAll(cx, checks);
        }),
        {
            pics: "S.C.C03.Tx",
            expected: "Test Harness receives the RemoveAllScenes command from the DUT, carrying GroupID.",
        },
    )
    .step(
        5,
        "DUT issues a StoreScene command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) => {
            const { checks } = await invokeScenes(cx, ref, "storeScene", { groupId: GROUP.id, sceneId: SCENE_ID }, [
                { id: 0, value: GROUP.id },
                { id: 1, value: SCENE_ID },
            ]);
            await recordAll(cx, checks);
        }),
        {
            pics: "S.C.C04.Tx",
            expected: "Test Harness receives the StoreScene command from the DUT, carrying GroupID and SceneID.",
        },
    )
    .step(
        6,
        "DUT issues a RecallScene command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) => {
            // TransitionTime is optional on this command; the plan asks for its type where present, so
            // it is sent and checked rather than omitted.
            const { checks } = await invokeScenes(
                cx,
                ref,
                "recallScene",
                { groupId: GROUP.id, sceneId: SCENE_ID, transitionTime: TRANSITION_TIME },
                [
                    { id: 0, value: GROUP.id },
                    { id: 1, value: SCENE_ID },
                    { id: 2, value: TRANSITION_TIME },
                ],
            );
            await recordAll(cx, checks);
        }),
        {
            pics: "S.C.C05.Tx",
            expected:
                "Test Harness receives the RecallScene command from the DUT, carrying GroupID, SceneID and the " +
                "optional TransitionTime.",
        },
    )
    .step(
        7,
        "DUT issues a GetSceneMembership command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) => {
            const { checks } = await invokeScenes(cx, ref, "getSceneMembership", { groupId: GROUP.id }, [
                { id: 0, value: GROUP.id },
            ]);
            await recordAll(cx, checks);
        }),
        {
            pics: "S.C.C06.Tx",
            expected: "Test Harness receives the GetSceneMembership command from the DUT, carrying GroupID.",
        },
    )
    .step(
        8,
        "DUT issues a CopyScene command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) =>
            withChecks(cx, async checks => {
                // `copyAllScenes` is left clear, which is the case the plan's own parameter note describes
                // as "otherwise this bit is set to 0".
                const invoked = await invokeScenes(
                    cx,
                    ref,
                    "copyScene",
                    {
                        mode: {},
                        groupIdentifierFrom: GROUP.id,
                        sceneIdentifierFrom: SCENE_ID,
                        groupIdentifierTo: GROUP.id,
                        sceneIdentifierTo: COPIED_SCENE_ID,
                    },
                    [
                        { id: 1, value: GROUP.id },
                        { id: 2, value: SCENE_ID },
                        { id: 3, value: GROUP.id },
                        { id: 4, value: COPIED_SCENE_ID },
                    ],
                );
                checks.push(...invoked.checks);

                const payload = await expectPayloadLines(
                    cx,
                    invoked.from,
                    "CopyScene Mode (ID 0) with CopyAllScenes clear",
                    {
                        chip: [/0x0 = 0 \(unsigned\),/],
                        matterjs: [/mode: \{ copyAllScenes: false \}/],
                    },
                );
                checks.push(payload);
            }),
        ),
        {
            pics: "S.C.C40.Tx",
            expected:
                "Test Harness receives the CopyScene command from the DUT, carrying Mode with CopyAllScenes " +
                "clear and the source and destination group and scene ids.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
