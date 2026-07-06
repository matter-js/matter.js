/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNode, DesiredStateBehavior, itemMapKey } from "@matter/node";
import { Task } from "../Task.js";
import { TaskContext, TaskPhase } from "../types.js";
import { membershipKey } from "./keys.js";

export const REMOVE_NODE_FROM_GROUP_TYPE = "removeNodeFromGroup";

export interface RemoveNodeFromGroupParams {
    peerId: string;
    endpoint: number;
    groupId: number;
}

/**
 * Removes a peer endpoint from a group: drops the membership, then the group-to-key-set map and the key set
 * itself — but only while no other group still references them ({@link TaskContext.removeIntentIfUnreferenced}).
 * Dependents-first (membership, then map, then key set) so each reference check sees the prior removal.
 */
export class RemoveNodeFromGroup extends Task<RemoveNodeFromGroupParams> {
    readonly type = REMOVE_NODE_FROM_GROUP_TYPE;

    static override idFor(p: RemoveNodeFromGroupParams): string {
        return `${REMOVE_NODE_FROM_GROUP_TYPE}:${p.peerId}:${p.groupId}:${p.endpoint}`;
    }

    get phases(): TaskPhase[] {
        return [{ name: "remove", run: ctx => this.#remove(ctx) }];
    }

    async #remove(ctx: TaskContext): Promise<void> {
        const p = this.params;
        const peer = ctx.tryResolvePeer(p.peerId);
        if (peer === undefined) {
            return; // decommissioned: intent is GC'd with the node
        }

        // The keyset id is unreadable once the map intent is gone, so capture it before removal.
        const keySetId = this.#mappedKeySetId(peer, p.groupId);

        const removed = new Array<{ kind: string; key: string }>();
        if (
            await ctx.removeIntentIfUnreferenced(peer, "endpointGroupMembership", membershipKey(p.groupId, p.endpoint))
        ) {
            removed.push({ kind: "endpointGroupMembership", key: membershipKey(p.groupId, p.endpoint) });
        }
        if (await ctx.removeIntentIfUnreferenced(peer, "groupKeyMap", String(p.groupId))) {
            removed.push({ kind: "groupKeyMap", key: String(p.groupId) });
        }
        if (keySetId !== undefined && (await ctx.removeIntentIfUnreferenced(peer, "groupKey", String(keySetId)))) {
            removed.push({ kind: "groupKey", key: String(keySetId) });
        }

        if (removed.length > 0) {
            await ctx.awaitGate([peer], () => removed.every(r => ctx.itemAbsent(peer, r.kind, r.key)));
        }
    }

    #mappedKeySetId(peer: ClientNode, groupId: number): number | undefined {
        const item = peer.stateOf(DesiredStateBehavior).items[itemMapKey("groupKeyMap", String(groupId))];
        return (item?.intent as { groupKeySetId?: number } | undefined)?.groupKeySetId;
    }
}
