/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeApi, CertNodeRef, CertStepContext } from "@matter/testing";
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

/**
 * What TC-SC-5.3 and TC-SC-6.1 both do before they diverge: the group communication plan opens both
 * cases by having the controller admit a group in the device's ACL, write a key set, bind the group to
 * it and add the group. TC-SC-6.1 then reads that state back over unicast; TC-SC-5.3 sends a
 * groupcast through it.
 *
 * @see {@link MatterSpecification.v16.Core} § 11.2
 */

export const GROUP_KEY_MANAGEMENT = Matter.clusters.require("GroupKeyManagement");
export const GROUPS = Matter.clusters.require("Groups");
export const ACCESS_CONTROL = Matter.clusters.require("AccessControl");

export const GROUP_KEY_MANAGEMENT_ID = requireId(GROUP_KEY_MANAGEMENT.id, "GroupKeyManagement cluster");
export const GROUPS_ID = requireId(GROUPS.id, "Groups cluster");
export const ACCESS_CONTROL_ID = requireId(ACCESS_CONTROL.id, "AccessControl cluster");

/** GroupKeyManagement and AccessControl are root-node clusters; Groups lives on the on/off light. */
export const ROOT_ENDPOINT = 0;
export const GROUPS_ENDPOINT = 1;

export const GROUP = { id: 1, name: "GroupOne" };
export const GROUP_KEY_SET_ID = 1;

/** The fabric's own IPK key set, which commissioning writes and no step removes (Matter Core § 11.2.2). */
export const IPK_KEY_SET_ID = 0;

/** The Groups feature that decides whether a `ViewGroupResponse` may answer with an empty name. */
export const GROUP_NAMES_PROPERTY = "groupNames";
export const GROUP_NAMES_FEATURE = 1 << 0;

/** `AccessControlEntryPrivilegeEnum.Operate` and `AccessControlEntryAuthModeEnum.Group`. */
export const PRIVILEGE_OPERATE = 3;

/** `AccessControlEntryPrivilegeEnum.Manage`, which a group needs to invoke `Groups.AddGroup`. */
export const PRIVILEGE_MANAGE = 4;
export const AUTH_MODE_GROUP = 3;

export function attributeId(cluster: typeof GROUP_KEY_MANAGEMENT, attributeName: string): number {
    return requireId(cluster.attributes.require(attributeName).id, `${cluster.name}.${attributeName}`);
}

/**
 * The key set the DUT writes, in the shape the plan's step 1b describes. The start time is a Unix
 * timestamp rather than the plan's own literal, for the reason AGENTS.md records under "An `epoch-us`
 * cannot carry the plan's literal start time"; nothing here depends on its value.
 */
export function groupKeySet() {
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
export async function invokeAndCheck(
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
export async function keepsGroupNames(node: CertNodeApi): Promise<boolean> {
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
export async function readAcl(node: CertNodeApi): Promise<unknown[]> {
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
export function isGroupEntry(entry: unknown): boolean {
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

/**
 * The plan's step "1a": the controller commissions the device and admits the group in its ACL.
 *
 * `privilege` is what the group is allowed to do, and a case picks it from what its own later steps
 * send: a group message carrying `Groups.AddGroup` needs Manage, while one that only operates needs
 * Operate. Too little is not refused — a group message is unacknowledged, so the device simply does
 * nothing and the case fails on the effect it looked for rather than on a status.
 */
export function aclAdmitsGroupStep(commissioned: CommissionedRefs, privilege = PRIVILEGE_OPERATE) {
    return async (cx: CertStepContext) => {
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
            [...existing, { privilege, authMode: AUTH_MODE_GROUP, subjects: [GROUP.id], targets: null }],
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
    };
}

/** The plan's step "1b": the key material the next step writes, produced in-process. */
export function keyMaterialStep() {
    return async (cx: CertStepContext) => {
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
    };
}

/**
 * The plan's KeySetWrite step. The controller provisions itself with the same key set it writes to the
 * device: the plan has it *generate* the key, and a controller that only told the device about it
 * could not encrypt a groupcast with it.
 */
export function keySetWriteStep(commissioned: CommissionedRefs) {
    return commissioned.withRef("dut", async (cx: CertStepContext, ref: CertNodeRef) => {
        await cx.controllers.dut.group(GROUP.id).defineKeySet(groupKeySet());

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
    });
}

/**
 * The plan's GroupKeyMap step, which binds the group to the key set that was just written.
 *
 * `groups` is every group the case needs bound, because `Groups.AddGroup` answers `UNSUPPORTED_ACCESS`
 * for a group the fabric's GroupKeyMap does not name (Matter Application Clusters § 1.3.7.1) — so a
 * case that later adds a *second* group has to bind that one here as well.
 */
export function groupKeyMapStep(commissioned: CommissionedRefs, groups: number[] = [GROUP.id]) {
    return commissioned.withRef("dut", async (cx: CertStepContext, ref: CertNodeRef) => {
        const th = cx.devices.th;
        const from = th.log.mark();
        const path = {
            endpoint: ROOT_ENDPOINT,
            cluster: GROUP_KEY_MANAGEMENT_ID,
            attribute: attributeId(GROUP_KEY_MANAGEMENT, "groupKeyMap"),
        };

        await cx.controllers.dut.node(ref).writeAttribute(
            path,
            groups.map(groupId => ({ groupId, groupKeySetId: GROUP_KEY_SET_ID })),
        );
        cx.recorder.check({ type: "response", verdict: "pass", detail: "GroupKeyMap write accepted" });

        record(
            cx,
            await expectMessageWithPath(th.log, th.flavor, "write", path, from, LOG_TIMEOUT),
            "WriteRequestMessage log for GroupKeyManagement.groupKeyMap",
        );

        const readBack = await cx.controllers.dut.node(ref).readAttribute(path);
        const bound =
            Array.isArray(readBack) &&
            groups.every(wanted =>
                readBack.some(entry => {
                    if (typeof entry !== "object" || entry === null) {
                        return false;
                    }
                    const { groupId, groupKeySetId } = entry as { groupId?: unknown; groupKeySetId?: unknown };
                    return groupId === wanted && groupKeySetId === GROUP_KEY_SET_ID;
                }),
            );
        record(
            cx,
            {
                type: "response",
                verdict: bound ? "pass" : "fail",
                detail: `GroupKeyMap reads back as ${describeValue(readBack)}`,
            },
            "the binding the TH kept",
        );
    });
}

/** The plan's AddGroup step, which makes the device a member of the group. */
export function addGroupStep(commissioned: CommissionedRefs) {
    return commissioned.withRef("dut", async (cx: CertStepContext, ref: CertNodeRef) => {
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
    });
}

/**
 * The multicast address a fabric uses for a group: `FF35:0040:FD<fabric id>00:<group id>`, sixteen
 * bytes with the fabric's own id in the middle.
 *
 * @see {@link MatterSpecification.v16.Core} § 4.15.3
 */
export function groupMulticastAddress(fabricId: bigint, groupId: number): Uint8Array {
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0xff35);
    view.setUint16(2, 0x0040);
    view.setUint8(4, 0xfd);
    view.setBigUint64(5, fabricId);
    view.setUint8(13, 0x00);
    view.setUint16(14, groupId);
    return bytes;
}

/** An IPv6 address as its sixteen bytes, or undefined for text that is not one. */
export function ipv6Bytes(address: string): Uint8Array | undefined {
    const [head, tail] = address.split("::", 2);
    const parse = (part: string) => (part === "" ? [] : part.split(":").map(group => Number.parseInt(group, 16)));
    const left = parse(head);
    const right = tail === undefined ? [] : parse(tail);
    if ([...left, ...right].some(group => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
        return undefined;
    }
    const groups =
        tail === undefined ? left : [...left, ...new Array<number>(8 - left.length - right.length).fill(0), ...right];
    if (groups.length !== 8) {
        return undefined;
    }

    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    groups.forEach((group, index) => view.setUint16(index * 2, group));
    return bytes;
}
