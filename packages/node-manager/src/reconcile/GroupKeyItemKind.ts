/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import type { ClientNode, ItemKind, ManagedItem } from "@matter/node";
import { DesiredStateBehavior } from "@matter/node";
import { GroupKeyManagementClient } from "@matter/node/behaviors/group-key-management";
import { Status } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { PRIORITY_BANDS } from "./priority.js";

export type GroupKeyGrant = GroupKeyManagement.GroupKeySet;

/**
 * The `groupKey` ItemKind: provisions group key sets via GroupKeyManagement commands. Apply is
 * create-if-absent: skips KeySetWrite when the id is already present because key material is
 * unreadable and a re-apply would clobber a richer set with our minimal one. Verify confirms
 * presence only — KeySetRead returns epoch keys as null, so key material is unverifiable.
 * Epoch-key rotation is driven by the intent changing, not by verify.
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
        const commands = this.#commands(node);
        // Create-if-absent: never overwrite an existing key set (key material is unreadable, so a re-apply
        // would clobber a richer set with our minimal one). Updates/rotation are the dedicated ipk task.
        const { groupKeySetIDs } = await commands.keySetReadAllIndices();
        if (groupKeySetIDs.includes(item.intent.groupKeySetId)) {
            return;
        }
        await commands.keySetWrite({ groupKeySet: item.intent });
    }

    async verify(node: ClientNode, item: ManagedItem<GroupKeyGrant>): Promise<boolean> {
        const { groupKeySetIDs } = await this.#commands(node).keySetReadAllIndices();
        return groupKeySetIDs.includes(item.intent.groupKeySetId);
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
