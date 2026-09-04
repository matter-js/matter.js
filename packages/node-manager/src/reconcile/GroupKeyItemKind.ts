/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import type { ClientNode, ItemKind, ManagedItem } from "@matter/node";
import { DesiredStateBehavior } from "@matter/node";
import { GroupKeyManagementClient } from "@matter/node/behaviors/group-key-management";
import { Status, StatusResponseError } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { PRIORITY_BANDS } from "./priority.js";

export type GroupKeyGrant = GroupKeyManagement.GroupKeySet;

/** Non-null epochStartTime values as sorted bigints — the key set's identity for diffing. */
function startsOf(g: GroupKeyGrant): bigint[] {
    return [g.epochStartTime0, g.epochStartTime1, g.epochStartTime2]
        .filter((t): t is number | bigint => t !== null && t !== undefined)
        .map(t => BigInt(t))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function setsEqual(a: bigint[], b: bigint[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * The `groupKey` ItemKind: provisions and rotates group key sets via GroupKeyManagement commands. Apply is
 * write-if-set-differs — key material is unreadable, but KeySetRead returns epochStartTimes, so we diff the
 * device's start-time set against the intent's and write the full struct when they differ (absent = empty set).
 * A same-set re-apply is a no-op (idempotent, no churn/clobber). verify confirms the id is present and the
 * start-time set matches. Rotation (RotateGroupKey) drives this by writing structs with distinct start-time sets.
 */
export class GroupKeyItemKind implements ItemKind<GroupKeyGrant> {
    readonly kind = "groupKey";
    readonly priority = PRIORITY_BANDS.keyset;

    #commands(node: ClientNode) {
        return node.commandsOf(GroupKeyManagementClient);
    }

    async apply(node: ClientNode, item: ManagedItem<GroupKeyGrant>): Promise<void> {
        if (item.intent.groupKeySetId === 0) {
            throw new ImplementationError(
                "groupKeySetId 0 is the IPK and is managed by commissioning, not the reconciler",
            );
        }
        const device = await this.#deviceStarts(node, item.intent.groupKeySetId);
        if (device !== undefined && setsEqual(device, startsOf(item.intent))) {
            return;
        }
        await this.#commands(node).keySetWrite({ groupKeySet: item.intent });
    }

    async verify(node: ClientNode, item: ManagedItem<GroupKeyGrant>): Promise<boolean> {
        const device = await this.#deviceStarts(node, item.intent.groupKeySetId);
        return device !== undefined && setsEqual(device, startsOf(item.intent));
    }

    /** The device's epochStartTime set for `id`, or undefined if the key set is absent. */
    async #deviceStarts(node: ClientNode, id: number): Promise<bigint[] | undefined> {
        try {
            const { groupKeySet } = await this.#commands(node).keySetRead({ groupKeySetId: id });
            return startsOf(groupKeySet);
        } catch (e) {
            if (StatusResponseError.is(e, Status.NotFound)) {
                return undefined;
            }
            throw e;
        }
    }

    async remove(node: ClientNode, item: ManagedItem<GroupKeyGrant>): Promise<void> {
        await this.#commands(node).keySetRemove({ groupKeySetId: item.intent.groupKeySetId });
    }

    isReferenced(node: ClientNode, key: string): boolean {
        const keySetId = Number(key);
        return Object.values(node.stateOf(DesiredStateBehavior).items).some(
            item =>
                item.kind === "groupKeyMap" &&
                item.status.state !== "deletePending" &&
                (item.intent as { groupKeySetId: number }).groupKeySetId === keySetId,
        );
    }

    // No capacity(): the key-set count has no subscribed attribute (only the KeySetReadAllIndices command),
    // and capacity must not live-read. The device's KeySetWrite RESOURCE_EXHAUSTED is the over-capacity gate.

    recoverable(code: number): boolean {
        return code === Status.Timeout || code === Status.Busy;
    }
}
