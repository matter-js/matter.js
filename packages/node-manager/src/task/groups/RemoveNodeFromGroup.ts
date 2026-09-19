/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNode, ItemKind } from "@matter/node";
import { PeerAddress } from "@matter/protocol";
import { GroupKey, GroupKeyMap, GroupMembership } from "../../reconcile/kinds.js";
import { addressLabel } from "../peer.js";
import { TaskDefinition } from "../Task.js";
import { TaskContext } from "../types.js";
import { Require } from "../validation.js";
import { membershipKey } from "./keys.js";

export const REMOVE_NODE_FROM_GROUP_TYPE = "removeNodeFromGroup";

export interface RemoveNodeFromGroupParams {
    peer: PeerAddress;
    endpoint: number;
    groupId: number;
}

/**
 * Removes a peer endpoint from a group: drops the membership, then the group-to-key-set map and the key set
 * itself — but only while no other group still references them ({@link TaskContext.removeIntentIfUnreferenced}).
 * Dependents-first (membership, then map, then key set) so each reference check sees the prior removal.
 *
 * @see {@link MatterSpecification.v16.Core} § 11.2.7.4, § 11.2.6.1
 * @see {@link MatterSpecification.v16.Cluster} § 1.3.7.4
 */
export const RemoveNodeFromGroup: TaskDefinition<RemoveNodeFromGroupParams> = {
    type: REMOVE_NODE_FROM_GROUP_TYPE,
    validate(params) {
        Require.params(REMOVE_NODE_FROM_GROUP_TYPE, params);
        Require.peer("peer", params.peer);
        Require.uint("endpoint", params.endpoint, 0xffff);
        Require.id("groupId", params.groupId, 0xffff);
    },

    slotKeyFor(p) {
        return `${REMOVE_NODE_FROM_GROUP_TYPE}:${addressLabel(p.peer)}:${p.groupId}:${p.endpoint}`;
    },

    phases(params) {
        return [{ name: "remove", run: ctx => remove(ctx, params) }];
    },
};

async function remove(ctx: TaskContext, p: RemoveNodeFromGroupParams): Promise<void> {
    const peer = ctx.tryResolvePeer(p.peer);
    if (peer === undefined) {
        return; // decommissioned: intent is GC'd with the node
    }

    // The keyset id is unreadable once the map intent is gone, so capture it before removal.
    const keySetId = mappedKeySetId(ctx, peer, p.groupId);

    const removed = new Array<{ kind: ItemKind; key: string }>();
    if (await ctx.removeIntentIfUnreferenced(peer, GroupMembership, membershipKey(p.groupId, p.endpoint))) {
        removed.push({ kind: GroupMembership, key: membershipKey(p.groupId, p.endpoint) });
    }
    if (await ctx.removeIntentIfUnreferenced(peer, GroupKeyMap, String(p.groupId))) {
        removed.push({ kind: GroupKeyMap, key: String(p.groupId) });
    }
    if (keySetId !== undefined && (await ctx.removeIntentIfUnreferenced(peer, GroupKey, String(keySetId)))) {
        removed.push({ kind: GroupKey, key: String(keySetId) });
    }

    if (removed.length > 0) {
        await ctx.awaitRemoved(removed.map(r => ({ peer, kind: r.kind, key: r.key })));
    }
}

function mappedKeySetId(ctx: TaskContext, peer: ClientNode, groupId: number): number | undefined {
    return ctx.intentOf(peer, GroupKeyMap, String(groupId))?.groupKeySetId;
}
