/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { Task } from "../Task.js";
import { TaskContext, TaskPhase } from "../types.js";
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
export class AddNodeToGroup extends Task<AddNodeToGroupParams> {
    readonly type = ADD_NODE_TO_GROUP_TYPE;

    static override idFor(params: AddNodeToGroupParams): string {
        return `${ADD_NODE_TO_GROUP_TYPE}:${params.peerId}:${params.groupId}:${params.endpoint}`;
    }

    get phases(): TaskPhase[] {
        return [{ name: "provision", run: ctx => this.#provision(ctx) }];
    }

    async #provision(ctx: TaskContext): Promise<void> {
        const p = this.params;
        const peer = ctx.resolvePeer(p.peerId);
        const groupId = GroupId(p.groupId);

        const keySet = {
            groupKeySetId: p.groupKeySetId,
            groupKeySecurityPolicy: p.groupKeySecurityPolicy,
            epochKey0: p.epochKey0,
            epochStartTime0: p.epochStartTime0,
            epochKey1: null,
            epochStartTime1: null,
            epochKey2: null,
            epochStartTime2: null,
        };

        await ctx.setIntent(peer, "groupKey", String(p.groupKeySetId), keySet, "converge");
        await ctx.setIntent(
            peer,
            "groupKeyMap",
            String(p.groupId),
            { groupId, groupKeySetId: p.groupKeySetId },
            "converge",
        );
        await ctx.setIntent(
            peer,
            "endpointGroupMembership",
            membershipKey(p.groupId, p.endpoint),
            { localEndpoint: p.endpoint, groupId, groupName: p.groupName },
            "converge",
        );

        await ctx.awaitCommitted([
            { peer, kind: "groupKey", key: String(p.groupKeySetId) },
            { peer, kind: "groupKeyMap", key: String(p.groupId) },
            { peer, kind: "endpointGroupMembership", key: membershipKey(p.groupId, p.endpoint) },
        ]);
    }
}
