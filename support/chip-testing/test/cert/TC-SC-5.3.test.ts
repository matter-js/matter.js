/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Status } from "@matter/main/types";
import { Matter } from "@matter/model";
import type { CertAppVariant, CertControllerGroup, CertRunSetup, CertStepContext, CheckRecord } from "@matter/testing";
import { appVariantFor, certTest } from "@matter/testing";
import {
    aclAdmitsGroupStep,
    attributeId,
    addGroupStep,
    GROUP,
    GroupcastBranch,
    GROUPS,
    GROUPS_ENDPOINT,
    GROUPS_ID,
    groupKeySet,
    groupKeyMapStep,
    groupMulticastAddress,
    ipv6Bytes,
    joinGroupStep,
    PRIVILEGE_MANAGE,
    keyMaterialStep,
    keySetWriteStep,
} from "./tc-group-support.js";
import {
    CertCheckFailedError,
    CommissionedRefs,
    describeValue,
    dutControllerLogFlavor,
    expectSequence,
    GROUP_MESSAGE_PORT,
    expectGroupCommandArrival,
    type GroupCommandArrival,
    LOG_TIMEOUT,
    matterjsGroupInvokeSent,
    record,
    recordAll,
    requireId,
} from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** The group the plan's step 5 adds *through* the group the steps before it established. */
const SECOND_GROUP = { id: 2, name: "GroupTwo" };

const ADD_GROUP = requireId(GROUPS.commands.require("addGroup").id, "Groups.addGroup");

/**
 * The TH receiving the AddGroup this groupcast carried for GroupID 1 and dispatching it to the endpoint it reached,
 * with the group and name the message carried.
 */
const ARRIVAL: GroupCommandArrival = {
    group: GROUP.id,
    endpoint: GROUPS_ENDPOINT,
    cluster: GROUPS_ID,
    command: ADD_GROUP,
    fields: [
        { id: 0, value: SECOND_GROUP.id },
        { id: 1, value: SECOND_GROUP.name },
    ],
};

/**
 * The plan's step 5: an AddGroup sent as a group command over GroupID 1.
 *
 * A groupcast is unacknowledged and answered by nobody, so nothing comes back to check. Three things
 * stand in for a response, and the first is what makes the last one mean anything:
 *
 * - the TH does *not* hold group 2 beforehand, so its presence afterwards cannot predate the message;
 * - the TH's own log shows it dispatched this AddGroup, with the group and name the message carried —
 *   which is also what tells the step the message has been processed, since an unacknowledged
 *   multicast orders nothing against the unicast read that follows;
 * - and the TH then answers `ViewGroup(2)` with the group and the name.
 */
async function addGroupOverGroupcast(cx: CertStepContext) {
    const dut = cx.controllers.dut;
    const th = cx.devices.th;
    const node = dut.node(commissioned.require("dut"));

    // The window opens before the step acts at all: a device's own log reaches the follower on its own
    // schedule, and the lines this step looks for name the group and command it sends, so nothing else
    // in the step's span can satisfy them
    const thFrom = th.log.mark();

    const before = await node.invoke(GROUPS.name, "viewGroup", { groupId: SECOND_GROUP.id }, GROUPS_ENDPOINT);
    const absent = Number(statusOf(before)) === Status.NotFound;

    const from = await dut.log.markSettled();

    await dut
        .group(GROUP.id)
        .invoke(GROUPS.name, "addGroup", { groupId: SECOND_GROUP.id, groupName: SECOND_GROUP.name });

    const sent = await groupcastSentCheck(cx, from);
    const dispatched = await expectGroupCommandArrival(
        th.log,
        th.flavor,
        `the TH dispatching AddGroup(${SECOND_GROUP.id}, "${SECOND_GROUP.name}")`,
        ARRIVAL,
        thFrom,
        LOG_TIMEOUT,
    );

    const response = await node.invoke(GROUPS.name, "viewGroup", { groupId: SECOND_GROUP.id }, GROUPS_ENDPOINT);
    const { status, groupId, groupName } =
        typeof response === "object" && response !== null
            ? (response as { status?: unknown; groupId?: unknown; groupName?: unknown })
            : {};
    const arrived =
        Number(status) === Status.Success && Number(groupId) === SECOND_GROUP.id && groupName === SECOND_GROUP.name;

    await recordAll(cx, [
        {
            check: () => ({
                type: "response",
                verdict: absent ? "pass" : "fail",
                detail: `before the groupcast the TH answers ViewGroup(${SECOND_GROUP.id}) with ${describeValue(before)}`,
            }),
            what: "the group the groupcast will add is not on the TH already",
        },
        { check: () => sent, what: "the DUT sent the command to the group's own multicast address" },
        { check: () => dispatched, what: "the TH dispatched the AddGroup the groupcast carried" },
        {
            check: () => ({
                type: "response",
                verdict: arrived ? "pass" : "fail",
                detail: `after the groupcast the TH answers ViewGroup(${SECOND_GROUP.id}) with ${describeValue(response)}`,
            }),
            what: "the group the groupcast asked the TH to add is on the TH, under the name it carried",
        },
    ]);

    if (!absent || !arrived) {
        throw new CertCheckFailedError(
            `group ${SECOND_GROUP.id} was ${absent ? "not added by" : "already on the TH before"} the groupcast`,
        );
    }
}

/** The status a `ViewGroupResponse` carries, or undefined for an answer that is not one. */
function statusOf(response: unknown): unknown {
    return typeof response === "object" && response !== null ? (response as { status?: unknown }).status : undefined;
}

/**
 * The sender's line for installing its own operational certificate, which names the fabric the group address is
 * derived from.
 */
const FABRIC_LINE = /Installing operational certificate nodeId: \S+ fabricId: (\d+)/;

/** matter.js's line for this case's group invoke, capturing the address it went to. */
const GROUP_INVOKE_LINE = matterjsGroupInvokeSent(GROUP.id, GROUPS_ID, ADD_GROUP);

/**
 * Confirms the message went where a group message must go: to the multicast address this fabric uses for this
 * group, on a session the sender itself renders as a group one.
 *
 * The address is recomputed from the sender's fabric id and the group id and compared byte for byte with the
 * destination the invoke names, which also proves it is GroupID 1 and not another group.
 */
async function groupcastSentCheck(cx: CertStepContext, from: number): Promise<CheckRecord> {
    const dut = cx.controllers.dut;

    if (dutControllerLogFlavor(cx) === "chip") {
        return chipPerGroupSentCheck(cx, from);
    }

    const fabricLine = await expectSequence(
        dut.log,
        "matterjs",
        "the DUT's operational certificate install",
        { matterjs: [FABRIC_LINE] },
        0,
        LOG_TIMEOUT,
    );
    if (fabricLine.verdict !== "pass" || fabricLine.matched === undefined) {
        return fabricLine;
    }
    const [, fabric] = FABRIC_LINE.exec(fabricLine.matched) ?? [];
    if (fabric === undefined) {
        return { type: "device-log", verdict: "fail", detail: `unreadable certificate line: ${fabricLine.matched}` };
    }

    const invoke = await expectSequence(
        dut.log,
        "matterjs",
        `a group invoke on port ${GROUP_MESSAGE_PORT}`,
        { matterjs: [GROUP_INVOKE_LINE] },
        from,
        LOG_TIMEOUT,
    );
    if (invoke.verdict !== "pass" || invoke.matched === undefined) {
        return invoke;
    }
    const [, address] = GROUP_INVOKE_LINE.exec(invoke.matched) ?? [];

    const expected = groupMulticastAddress(BigInt(fabric), GROUP.id);
    const actual = address === undefined ? undefined : ipv6Bytes(address);
    if (actual === undefined || Bytes.toHex(actual) !== Bytes.toHex(expected)) {
        return {
            type: "device-log",
            verdict: "fail",
            detail:
                `the DUT sent group ${GROUP.id} on fabric ${fabric} to ${address}, and § 4.15.3 makes it ` +
                `${Bytes.toHex(expected)}`,
            matched: invoke.matched,
            logLine: invoke.logLine,
        };
    }

    return invoke;
}

const ON_OFF = Matter.clusters.require("OnOff");
const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const TOGGLE = requireId(ON_OFF.commands.require("toggle").id, "OnOff.toggle");

/** The Groupcast IANA-assigned multicast address (Matter Core § 2.5.6.2.1). */
const IANA_GROUP_ADDRESS = "ff05::fa";

/**
 * The legacy steps bind a group key through GroupKeyMap, which a chip all-clusters build with Groupcast refuses once
 * Groups reaches cluster revision 5. Only this project's own chip build offers the variant without Groupcast, so the
 * legacy branch runs there and a released binary takes the Groupcast branch.
 */
const APP_VARIANT: CertAppVariant = { matterjs: "nogroupcast" };

/**
 * Whether the TH this case runs against has Groupcast on its root. The controller's group address depends on it and a
 * controller that needs its keys before it starts has to know it before any step runs, so it is decided from the
 * app variant the TH runs; step 1a reads the TH's root and fails where the TH disagrees.
 *
 * matter.js's all-clusters app and the chip all-clusters app both mount Groupcast on their root; only the
 * `nogroupcast` variant leaves it out.
 */
function thHasGroupcast({ deviceFlavor }: CertRunSetup) {
    return deviceFlavor !== undefined && appVariantFor(deviceFlavor, APP_VARIANT) !== "nogroupcast";
}

/** The group the DUT sends on, on the address the branch the TH takes needs. */
function controllerGroups(setup: CertRunSetup): CertControllerGroup[] {
    return [
        {
            groupId: GROUP.id,
            keySet: groupKeySet(),
            ...(thHasGroupcast(setup) ? { addressPolicy: "ianaAddr" as const } : {}),
        },
    ];
}

const branch = new GroupcastBranch();

/**
 * The plan's step 7: an OnOff toggle sent as a group command over GroupID 1, which reaches the endpoint step 6 joined.
 * The TH's OnOff state before and after shows it acted on the message, and the DUT's log shows the message went to the
 * IANA address on the group message port.
 */
async function toggleOverGroupcast(cx: CertStepContext) {
    const dut = cx.controllers.dut;
    const th = cx.devices.th;
    const node = dut.node(commissioned.require("dut"));
    const path = { endpoint: GROUPS_ENDPOINT, cluster: ON_OFF_ID, attribute: attributeId(ON_OFF, "onOff") };

    const thFrom = th.log.mark();
    const before = await node.readAttribute(path);
    const from = await dut.log.markSettled();

    await dut.group(GROUP.id).invoke(ON_OFF.name, "toggle");

    const sent = await ianaSentCheck(cx, from);
    const dispatched = await expectGroupCommandArrival(
        th.log,
        th.flavor,
        "the TH dispatching the OnOff toggle",
        { group: GROUP.id, endpoint: GROUPS_ENDPOINT, cluster: ON_OFF_ID, command: TOGGLE },
        thFrom,
        LOG_TIMEOUT,
    );
    const after = await node.readAttribute(path);
    const toggled = typeof before === "boolean" && after === !before;

    await recordAll(cx, [
        { check: () => sent, what: "the DUT sent the command to the IANA group address" },
        { check: () => dispatched, what: "the TH dispatched the toggle the groupcast carried" },
        {
            check: () => ({
                type: "response",
                verdict: toggled ? "pass" : "fail",
                detail: `the TH's OnOff read ${describeValue(before)} before the groupcast and ${describeValue(after)} after`,
            }),
            what: "the TH acted on the groupcast",
        },
    ]);
}

/** chip-tool's transmit line for a group message, capturing its destination address. */
const CHIP_GROUP_TX = new RegExp(
    `\\(G\\) Msg TX .* to \\d+:FFFFFFFFFFFF${GROUP.id.toString(16).toUpperCase().padStart(4, "0")} .*\\[UDP:\\[([0-9a-f:]+)\\]:${GROUP_MESSAGE_PORT}\\]`,
);

const TOGGLE_INVOKE_LINE = matterjsGroupInvokeSent(GROUP.id, ON_OFF_ID, TOGGLE);

/** Confirms the toggle went to the IANA address on the group message port, as each controller's log states it. */
async function ianaSentCheck(cx: CertStepContext, from: number): Promise<CheckRecord> {
    const flavor = dutControllerLogFlavor(cx);
    const line = flavor === "chip" ? CHIP_GROUP_TX : TOGGLE_INVOKE_LINE;
    const sent = await expectSequence(
        cx.controllers.dut.log,
        flavor,
        `a group send to ${IANA_GROUP_ADDRESS} on port ${GROUP_MESSAGE_PORT}`,
        flavor === "chip" ? { chip: [line] } : { matterjs: [line] },
        from,
        LOG_TIMEOUT,
    );
    if (sent.verdict !== "pass" || sent.matched === undefined) {
        return sent;
    }
    const [, address] = line.exec(sent.matched) ?? [];
    const actual = address === undefined ? undefined : ipv6Bytes(address);
    const expected = ipv6Bytes(IANA_GROUP_ADDRESS);
    if (actual === undefined || expected === undefined || Bytes.toHex(actual) !== Bytes.toHex(expected)) {
        return {
            ...sent,
            verdict: "fail",
            detail:
                `the DUT sent group ${GROUP.id} to ${address ?? sent.matched}, and Groupcast's IANA address is ` +
                IANA_GROUP_ADDRESS,
        };
    }
    return sent;
}

/**
 * chip-tool's transmit line names the destination but not the fabric id, so the address is checked for the per-group
 * form `FF35:0040:FD<fabric id>00:<group id>` with this case's group id rather than recomputed byte for byte.
 */
async function chipPerGroupSentCheck(cx: CertStepContext, from: number): Promise<CheckRecord> {
    const sent = await expectSequence(
        cx.controllers.dut.log,
        "chip",
        `a group send to group ${GROUP.id} on port ${GROUP_MESSAGE_PORT}`,
        { chip: [CHIP_GROUP_TX] },
        from,
        LOG_TIMEOUT,
    );
    if (sent.verdict !== "pass" || sent.matched === undefined) {
        return sent;
    }
    const [, address] = CHIP_GROUP_TX.exec(sent.matched) ?? [];
    const bytes = address === undefined ? undefined : ipv6Bytes(address);
    const perGroup =
        bytes !== undefined &&
        Bytes.toHex(bytes.subarray(0, 5)) === "ff350040fd" &&
        bytes[13] === 0 &&
        ((bytes[14] << 8) | bytes[15]) === GROUP.id;
    return perGroup
        ? sent
        : {
              ...sent,
              verdict: "fail",
              detail: `the DUT sent group ${GROUP.id} to ${address ?? sent.matched}, which is not its per-group address`,
          };
}

certTest("TC-SC-5.3", {
    plan: "group_communication.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "GRPKEY.C"],
    app: "all-clusters",

    // A chip-docker image runs its own binary and cannot run the variant, so it is left out
    appVariant: APP_VARIANT,
    flavors: ["chip-local", "matterjs"],

    // The groupcast is the case's subject, and the steps before it rest on the key set step 2 gives both sides, so a
    // controller without group messaging skips the case rather than running them without it
    controllerCapabilities: ["group-messaging"],

    controllerGroups,
})
    .step(
        "1a",
        "TH should have the ACL entry with the AuthMode as Group by DUT",
        async cx => {
            branch.reset();
            await aclAdmitsGroupStep(commissioned, PRIVILEGE_MANAGE)(cx);
            record(
                cx,
                await branch.learn(cx.controllers.dut.node(commissioned.require("dut")), thHasGroupcast(cx)),
                "the TH's root decides the plan's branch, and the controller's group address follows it",
            );
        },
        {
            expected:
                "The TH's ACL carries an entry whose AuthMode is Group and whose subjects name the group, alongside " +
                "the administer entry the DUT itself uses. The TH's root ServerList says which branch of the plan " +
                "applies.",
        },
    )
    .step("1b", "DUT generates a random key and EpochKey0 assigned to GroupKeySetID 1", keyMaterialStep(), {
        expected:
            "The DUT holds a key set the next step can write. This step produces the artifact in-process, so it is " +
            "not evidence about the TH.",
    })
    .step(
        2,
        "DUT sends KeySetWrite command to GroupKeyManagement cluster to TH on EP0",
        keySetWriteStep(commissioned, true),
        {
            pics: "GRPKEY.C.C00.Tx",
            expected: "Test Harness receives the KeySetWrite command from the DUT.",
        },
    )
    .step(
        3,
        "DUT binds GroupId with GroupKeySetID in the GroupKeyMap attribute list on GroupKeyManagement cluster",
        // Both groups: the group the message travels on, and the one its AddGroup names, which the TH
        // would otherwise refuse for want of a key set
        groupKeyMapStep(commissioned, [GROUP.id, SECOND_GROUP.id]),
        {
            pics: "GRPKEY.C.A0000",
            notApplicableAtRun: branch.legacyStepsApply,
            expected: "Test Harness receives the binding of GroupKeySetID with the GroupID from DUT.",
        },
    )
    .step(
        4,
        // The plan writes EP0 here, but Groups is not a root-node cluster: on both THs it lives on the
        // on/off light, so that is the endpoint the step exercises and the endpoint the report names
        'DUT sends AddGroup Command to TH on EP1 with GroupID 1 and GroupName "GroupOne"',
        addGroupStep(commissioned),
        {
            pics: "G.C.C00.Tx",
            notApplicableAtRun: branch.legacyStepsApply,
            expected: "Test Harness receives the AddGroup command from the DUT.",
        },
    )
    .step(
        5,
        "DUT sends a AddGroup Command to the Groups cluster with the GroupID field set to 2 and the GroupName set " +
            'to "GroupTwo". The command is sent as a group command using GroupID 1',
        addGroupOverGroupcast,
        {
            pics: "G.C.C00.Tx",
            notApplicableAtRun: branch.legacyStepsApply,
            expected:
                "The group message goes to the multicast address for this fabric and group on port 5540, sent on a " +
                "group session — which is what DSIZ names on the wire — and the TH holds the group it carried.",
        },
    )
    .step(
        6,
        "DUT sends the Groupcast JoinGroup command on the TH on EP0 with GroupID 1, Endpoints [1] and KeySetID 1",
        joinGroupStep(commissioned),
        {
            notApplicableAtRun: branch.groupcastStepsApply,
            expected: "The TH accepts the JoinGroup command from the DUT.",
        },
    )
    .step(
        7,
        "DUT sends a command from a cluster enabled on the Endpoint provided in step 6 to TH. The command is sent as " +
            "a group command using GroupID 1",
        toggleOverGroupcast,
        {
            notApplicableAtRun: branch.groupcastStepsApply,
            expected:
                "The group message goes to the IANA address FF05::FA on port 5540, sent on a group session, and the " +
                "TH toggles the OnOff state of the endpoint it joined.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
