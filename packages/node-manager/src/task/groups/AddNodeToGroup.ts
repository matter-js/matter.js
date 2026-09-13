/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import { GroupId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { GroupKey, GroupKeyMap, GroupMembership } from "../../reconcile/kinds.js";
import { RotationPreconditionError } from "../errors.js";
import { TaskDefinition } from "../Task.js";
import { TaskContext } from "../types.js";
import { Require } from "../validation.js";
import { membershipKey } from "./keys.js";
import { rotationIsSwitchingKeys } from "./RotateGroupKey.js";

export const ADD_NODE_TO_GROUP_TYPE = "addNodeToGroup";

/** The policies the key set struct may carry, so a stored value the device would reject is refused here. */
export const SECURITY_POLICIES = [
    GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
    GroupKeyManagement.GroupKeySecurityPolicy.CacheAndSync,
] as const;

export interface AddNodeToGroupParams {
    peerId: string;
    endpoint: number;
    groupId: number;
    groupName?: string;
    groupKeySetId: number;
    groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy;
    epochKey0: Uint8Array;
    epochStartTime0: bigint;
}

/**
 * Provisions a peer endpoint into a group: writes the group key set, maps the group to that key set, then
 * adds the endpoint to the group. A single `provision` phase sets the three converge intents and gates on
 * all three committing; the keyset(10) < group(20) < membership(30) priority bands order the apply.
 */
export const AddNodeToGroup: TaskDefinition<AddNodeToGroupParams> = {
    type: ADD_NODE_TO_GROUP_TYPE,
    validate(params) {
        Require.params(ADD_NODE_TO_GROUP_TYPE, params);
        Require.text("peerId", params.peerId);
        Require.uint("endpoint", params.endpoint, 0xffff);
        Require.id("groupId", params.groupId, 0xffff);
        Require.id("groupKeySetId", params.groupKeySetId, 0xffff);
        Require.oneOf("groupKeySecurityPolicy", params.groupKeySecurityPolicy, SECURITY_POLICIES);
        if (params.groupName !== undefined) {
            // Groups constrains AddGroup's GroupName to 16 characters.
            Require.label("groupName", params.groupName, 16);
        }
        Require.bytes("epochKey0", params.epochKey0, 16);
        Require.epoch("epochStartTime0", params.epochStartTime0);
    },

    slotKeyFor(params) {
        return `${ADD_NODE_TO_GROUP_TYPE}:${params.peerId}:${params.groupId}:${params.endpoint}`;
    },

    phases(params) {
        return [
            {
                name: "provision",
                requires: ctx => refuseWhileKeysSwitch(ctx, params),
                run: ctx => provision(ctx, params),
            },
        ];
    },

    plannedChanges(p) {
        return [
            { peerId: p.peerId, kind: GroupKey, key: String(p.groupKeySetId), intent: keySet(p) },
            {
                peerId: p.peerId,
                kind: GroupKeyMap,
                key: String(p.groupId),
                intent: { groupId: GroupId(p.groupId), groupKeySetId: p.groupKeySetId },
            },
            {
                peerId: p.peerId,
                kind: GroupMembership,
                key: membershipKey(p.groupId, p.endpoint),
                intent: { localEndpoint: p.endpoint, groupId: GroupId(p.groupId), groupName: p.groupName },
            },
        ];
    },
};

function keySet(p: AddNodeToGroupParams) {
    return {
        groupKeySetId: p.groupKeySetId,
        groupKeySecurityPolicy: p.groupKeySecurityPolicy,
        epochKey0: p.epochKey0,
        epochStartTime0: p.epochStartTime0,
        epochKey1: null,
        epochStartTime1: null,
        epochKey2: null,
        epochStartTime2: null,
    };
}

/**
 * A rotation that has begun switching members to its new key may not take on another member.
 *
 * Asked before this task writes and again after, because the rotation takes no lock either: a member added
 * while the switch is under way holds the old key alone, and the rotation drops that key from everyone else.
 * While the rotation is still handing the new key out, joining is fine — the rotation adopts the newcomer.
 */
function refuseWhileKeysSwitch(ctx: TaskContext, p: AddNodeToGroupParams): void {
    if (rotationIsSwitchingKeys(ctx, p.groupKeySetId)) {
        throw new RotationPreconditionError(
            `Cannot add peer ${p.peerId} to group ${p.groupId}: group key set ${p.groupKeySetId} is being ` +
                `rotated and its members are switching to the new key. Add the peer once the rotation ends.`,
        );
    }

    // A member joins the key the group is using, not the one the caller last saw. This is also what closes the
    // window after a rotation's last write and before it retires: the switching marker is gone by then, but the
    // members already carry the new key, so a join carrying the old one is refused here instead.
    const operational = operationalKeyOf(ctx, p.groupKeySetId);
    if (operational !== undefined && !Bytes.areEqual(operational, p.epochKey0)) {
        throw new RotationPreconditionError(
            `Cannot add peer ${p.peerId} to group ${p.groupId}: group key set ${p.groupKeySetId} is in use ` +
                `with a different key than these parameters carry. Add the peer with the key set's current key.`,
        );
    }
}

/** The key the members of this key set are using, if any member holds one. */
function operationalKeyOf(ctx: TaskContext, groupKeySetId: number): AllowSharedBufferSource | undefined {
    const key = String(groupKeySetId);
    for (const peer of ctx.peersWithIntent(GroupKey, key)) {
        const current = ctx.intentOf(peer, GroupKey, key);
        if (current?.epochKey0 !== undefined && current.epochKey0 !== null) {
            return current.epochKey0;
        }
    }
    return undefined;
}

async function provision(ctx: TaskContext, p: AddNodeToGroupParams): Promise<void> {
    const peer = ctx.resolvePeer(p.peerId);
    const groupId = GroupId(p.groupId);

    await ctx.setIntent(peer, GroupKey, String(p.groupKeySetId), keySet(p), "converge");
    await ctx.setIntent(peer, GroupKeyMap, String(p.groupId), { groupId, groupKeySetId: p.groupKeySetId }, "converge");
    await ctx.setIntent(
        peer,
        GroupMembership,
        membershipKey(p.groupId, p.endpoint),
        { localEndpoint: p.endpoint, groupId, groupName: p.groupName },
        "converge",
    );

    await ctx.awaitCommitted([
        { peer, kind: GroupKey, key: String(p.groupKeySetId) },
        { peer, kind: GroupKeyMap, key: String(p.groupId) },
        { peer, kind: GroupMembership, key: membershipKey(p.groupId, p.endpoint) },
    ]);
}
