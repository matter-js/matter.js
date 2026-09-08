/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { GroupKey, GroupKeyMap, GroupMembership } from "../../reconcile/kinds.js";
import { TaskDefinition } from "../Task.js";
import { TaskContext } from "../types.js";
import { Require } from "../validation.js";
import { membershipKey } from "./keys.js";

export const ADD_NODE_TO_GROUP_TYPE = "addNodeToGroup";

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
        Require.uint("groupId", params.groupId, 0xffff);
        Require.uint("groupKeySetId", params.groupKeySetId, 0xffff);
        Require.bytes("epochKey0", params.epochKey0, 16);
        Require.epoch("epochStartTime0", params.epochStartTime0);
    },

    slotKeyFor(params) {
        return `${ADD_NODE_TO_GROUP_TYPE}:${params.peerId}:${params.groupId}:${params.endpoint}`;
    },

    phases(params) {
        return [{ name: "provision", run: ctx => provision(ctx, params) }];
    },

    plannedChanges(p) {
        return [
            { peerId: p.peerId, kind: GroupKey.kind, key: String(p.groupKeySetId), intent: keySet(p) },
            {
                peerId: p.peerId,
                kind: GroupKeyMap.kind,
                key: String(p.groupId),
                intent: { groupId: GroupId(p.groupId), groupKeySetId: p.groupKeySetId },
            },
            {
                peerId: p.peerId,
                kind: GroupMembership.kind,
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
