/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import type { CapacityInfo, ClientNode, ItemKind, ManagedItem } from "@matter/node";
import { GroupKeyManagementClient } from "@matter/node/behaviors/group-key-management";
import { GroupsClient } from "@matter/node/behaviors/groups";
import { GroupId, Status, StatusResponseError } from "@matter/types";
import { PRIORITY_BANDS } from "./priority.js";

export interface GroupMembershipGrant {
    localEndpoint: number;
    groupId: GroupId;
    groupName?: string;
}

// GroupKeyManagement §4.16: MaxGroupsPerFabric is at least 4. Assume that floor if momentarily unread.
const MIN_GROUPS_PER_FABRIC = 4;

/**
 * The `endpointGroupMembership` ItemKind: adds a peer endpoint to a Groups-cluster group. Per-endpoint
 * and command-based (AddGroup / GetGroupMembership / RemoveGroup). The Groups commands carry their
 * application status in the response payload, so non-success statuses are re-thrown as
 * StatusResponseError to drive the engine's retry/drop handling. The group name is written but not
 * verified — GetGroupMembership returns only group IDs. Requires the group's key set and map to exist
 * first; the keyset(10) < group(20) < membership(30) priority bands enforce that order.
 */
export class GroupMembershipItemKind implements ItemKind<GroupMembershipGrant> {
    readonly kind = "endpointGroupMembership";
    readonly priority = PRIORITY_BANDS.membership;

    #commands(node: ClientNode, localEndpoint: number) {
        return node.endpoints.for(localEndpoint).commandsOf(GroupsClient);
    }

    async apply(node: ClientNode, item: ManagedItem<GroupMembershipGrant>): Promise<void> {
        const { localEndpoint, groupId, groupName } = item.intent;
        if (!node.endpoints.has(localEndpoint)) {
            throw new ImplementationError(`Group membership endpoint ${localEndpoint} not present on peer`);
        }
        const { status } = await this.#commands(node, localEndpoint).addGroup({ groupId, groupName: groupName ?? "" });
        if (status !== Status.Success) {
            throw new StatusResponseError(`AddGroup(${groupId}) on endpoint ${localEndpoint} failed`, status);
        }
    }

    async verify(node: ClientNode, item: ManagedItem<GroupMembershipGrant>): Promise<boolean> {
        const { localEndpoint, groupId } = item.intent;
        if (!node.endpoints.has(localEndpoint)) {
            return false;
        }
        const { groupList } = await this.#commands(node, localEndpoint).getGroupMembership({ groupList: [groupId] });
        return groupList.includes(groupId);
    }

    async remove(node: ClientNode, item: ManagedItem<GroupMembershipGrant>): Promise<void> {
        const { localEndpoint, groupId } = item.intent;
        if (!node.endpoints.has(localEndpoint)) {
            return;
        }
        const { status } = await this.#commands(node, localEndpoint).removeGroup({ groupId });
        if (status !== Status.Success && status !== Status.NotFound) {
            throw new StatusResponseError(`RemoveGroup(${groupId}) on endpoint ${localEndpoint} failed`, status);
        }
    }

    async capacity(node: ClientNode): Promise<CapacityInfo> {
        // Capacity reads the subscription-cached state — no live device read just to count.
        const { groupTable, maxGroupsPerFabric } = node.stateOf(GroupKeyManagementClient);
        return { limit: maxGroupsPerFabric ?? MIN_GROUPS_PER_FABRIC, used: (groupTable ?? []).length };
    }

    recoverable(code: number): boolean {
        return code === Status.Timeout || code === Status.Busy;
    }
}
