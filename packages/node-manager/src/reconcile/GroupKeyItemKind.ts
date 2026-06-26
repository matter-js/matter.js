/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import type { ClientNode, ItemKind, ManagedItem } from "@matter/node";
import { GroupKeyManagementClient } from "@matter/node/behaviors/group-key-management";
import { Status } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { PRIORITY_BANDS } from "./priority.js";

export type GroupKeyGrant = GroupKeyManagement.GroupKeySet;

/**
 * The `groupKey` ItemKind: provisions group key sets via GroupKeyManagement commands. Always writes
 * on apply (KeySetWrite is an idempotent overwrite and key material cannot be read back to compare);
 * verify confirms presence only — KeySetRead returns epoch keys as null, so key material is
 * unverifiable. Epoch-key rotation is driven by the intent changing, not by verify.
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
        await this.#commands(node).keySetWrite({ groupKeySet: item.intent });
    }

    async verify(node: ClientNode, item: ManagedItem<GroupKeyGrant>): Promise<boolean> {
        const { groupKeySetIDs } = await this.#commands(node).keySetReadAllIndices();
        return groupKeySetIDs.includes(item.intent.groupKeySetId);
    }

    async remove(node: ClientNode, item: ManagedItem<GroupKeyGrant>): Promise<void> {
        await this.#commands(node).keySetRemove({ groupKeySetId: item.intent.groupKeySetId });
    }

    // No capacity(): the key-set count has no subscribed attribute (only the KeySetReadAllIndices command),
    // and capacity must not live-read. The device's KeySetWrite RESOURCE_EXHAUSTED is the over-capacity gate.

    recoverable(code: number): boolean {
        return code === Status.Timeout || code === Status.Busy;
    }
}
