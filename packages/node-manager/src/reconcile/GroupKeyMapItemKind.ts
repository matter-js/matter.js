/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import type { CapacityInfo, ClientNode, ItemKind, ManagedItem } from "@matter/node";
import { GroupKeyManagementClient } from "@matter/node/behaviors/group-key-management";
import { FabricIndex, GroupId, Status } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { PRIORITY_BANDS } from "./priority.js";

type Entry = GroupKeyManagement.GroupKeyMap;

export interface GroupKeyMapGrant {
    groupId: GroupId;
    groupKeySetId: number;
}

// GroupKeyManagement §4.16: MaxGroupsPerFabric is at least 4. Assume that floor if momentarily unread.
const MIN_GROUPS_PER_FABRIC = 4;

/**
 * The `groupKeyMap` ItemKind: maps a group to its key set in the fabric-scoped groupKeyMap attribute.
 * A group maps to exactly one key set, so apply upserts by groupId (replacing a differing mapping)
 * rather than appending.
 */
export class GroupKeyMapItemKind implements ItemKind<GroupKeyMapGrant> {
    readonly kind = "groupKeyMap";
    readonly priority = PRIORITY_BANDS.group;

    async #read(node: ClientNode): Promise<Entry[]> {
        const { groupKeyMap } = await node.getStateOf(GroupKeyManagementClient, ["groupKeyMap"]);
        return groupKeyMap ?? [];
    }

    async #write(node: ClientNode, groupKeyMap: Entry[]): Promise<void> {
        await node.setStateOf(GroupKeyManagementClient, {
            groupKeyMap: groupKeyMap.map(e => ({ ...e, fabricIndex: FabricIndex.OMIT_FABRIC })),
        });
    }

    async apply(node: ClientNode, item: ManagedItem<GroupKeyMapGrant>): Promise<void> {
        const { groupId, groupKeySetId } = item.intent;
        if (groupKeySetId === 0) {
            throw new ImplementationError(
                "groupKeySetId 0 is the IPK and is managed by commissioning, not the reconciler",
            );
        }
        const current = await this.#read(node);
        if (current.some(e => e.groupId === groupId && e.groupKeySetId === groupKeySetId)) {
            return;
        }
        const others = current.filter(e => e.groupId !== groupId);
        await this.#write(node, [...others, { groupId, groupKeySetId, fabricIndex: FabricIndex.OMIT_FABRIC }]);
    }

    async verify(node: ClientNode, item: ManagedItem<GroupKeyMapGrant>): Promise<boolean> {
        const { groupId, groupKeySetId } = item.intent;
        const current = await this.#read(node);
        return current.some(e => e.groupId === groupId && e.groupKeySetId === groupKeySetId);
    }

    async remove(node: ClientNode, item: ManagedItem<GroupKeyMapGrant>): Promise<void> {
        const { groupId } = item.intent;
        const current = await this.#read(node);
        const kept = current.filter(e => e.groupId !== groupId);
        if (kept.length === current.length) {
            return;
        }
        await this.#write(node, kept);
    }

    async capacity(node: ClientNode): Promise<CapacityInfo> {
        const { groupKeyMap, maxGroupsPerFabric } = await node.getStateOf(GroupKeyManagementClient, [
            "groupKeyMap",
            "maxGroupsPerFabric",
        ]);
        return { limit: maxGroupsPerFabric ?? MIN_GROUPS_PER_FABRIC, used: (groupKeyMap ?? []).length };
    }

    recoverable(code: number): boolean {
        return code === Status.Timeout || code === Status.Busy;
    }
}
