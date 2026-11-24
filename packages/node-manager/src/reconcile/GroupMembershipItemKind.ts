/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import type { CapacityInfo, ClientNode, ItemKind, ItemWatch, ManagedItem } from "@matter/node";
import { GroupKeyManagementClient } from "@matter/node/behaviors/group-key-management";
import { GroupsClient } from "@matter/node/behaviors/groups";
import { EndpointNumber, GroupId, Status, StatusResponseError } from "@matter/types";
import { PRIORITY_BANDS } from "./priority.js";

export interface GroupMembershipGrant {
    localEndpoint: number;
    groupId: GroupId;
    groupName?: string;
}

// GroupKeyManagement §4.16: MaxGroupsPerFabric is at least 4. Assume that floor if momentarily unread.
const MIN_GROUPS_PER_FABRIC = 4;

/**
 * The one decision of whether `groupIdsOnEndpoint` include the intent's group. `verify` passes the groups
 * `GetGroupMembership` returns for the endpoint, and `satisfiedBy` the groups of our fabric's cached group table
 * entries that list the endpoint. The kind relies on both naming the same groups.
 */
function satisfies(groupIdsOnEndpoint: GroupId[], groupId: GroupId) {
    return groupIdsOnEndpoint.includes(groupId);
}

/**
 * The `endpointGroupMembership` ItemKind: adds a peer endpoint to a Groups-cluster group. Per-endpoint
 * and command-based (AddGroup / GetGroupMembership / RemoveGroup). The Groups commands carry their
 * application status in the response payload, so non-success statuses are re-thrown as
 * StatusResponseError to drive the engine's retry and give-up handling. The group name is written but not
 * verified — GetGroupMembership returns only group IDs. Requires the group's key set and map to exist
 * first; the keyset(10) < group(20) < membership(30) priority bands enforce that order.
 *
 * @see {@link MatterSpecification.v16.Cluster} § 1.3.7.1, § 1.3.7.3, § 1.3.7.4
 */
export class GroupMembershipItemKind implements ItemKind<GroupMembershipGrant> {
    readonly kind = "endpointGroupMembership";
    readonly priority = PRIORITY_BANDS.membership;

    // capacity is per-group (groupTable) but the key is per-endpoint; the group slot is gated by groupKeyMap.
    readonly excludeFromAdmission = true;

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
        return satisfies(groupList, groupId);
    }

    /**
     * No watch when `maxGroupsPerFabric` is 0, which a node with the Groupcast (GCAST) feature reports: its groups are
     * managed through the Groupcast cluster, and its group table is empty for a fabric that adopted Groupcast.
     *
     * @see {@link MatterSpecification.v16.Core} § 11.2.6.2, § 11.2.6.3
     */
    watches(node: ClientNode): ItemWatch[] {
        const groupKeyManagement = node.maybeStateOf(GroupKeyManagementClient);
        if (groupKeyManagement === undefined || groupKeyManagement.maxGroupsPerFabric === 0) {
            return [];
        }
        return [{ endpoint: node, behavior: GroupKeyManagementClient, attribute: "groupTable" }];
    }

    /**
     * Judges the cached `groupTable` by the same match as `verify`. Cached entries carry the index the device gave
     * our fabric, so only entries with {@link ClientNode.fabricIndexOnPeer} count. Without that index no entry counts,
     * and the answer `false` leads to a live `verify`.
     */
    satisfiedBy(node: ClientNode, item: ManagedItem<GroupMembershipGrant>): boolean {
        const { localEndpoint, groupId } = item.intent;
        const groupTable = node.maybeStateOf(GroupKeyManagementClient)?.groupTable ?? [];
        const groupIdsOnEndpoint = groupTable
            .filter(
                entry =>
                    entry.fabricIndex === node.fabricIndexOnPeer &&
                    entry.endpoints.includes(EndpointNumber(localEndpoint)),
            )
            .map(entry => entry.groupId);
        return satisfies(groupIdsOnEndpoint, groupId);
    }

    async remove(node: ClientNode, item: ManagedItem<GroupMembershipGrant>): Promise<void> {
        const { localEndpoint, groupId } = item.intent;
        if (!node.endpoints.has(localEndpoint)) {
            return;
        }
        // Groups carries its status in the response payload rather than as a command status, so a failure
        // reaches the engine only if it is thrown. `NotFound` is not special-cased here: the engine treats a
        // removal of something absent as done, for every kind.
        const { status } = await this.#commands(node, localEndpoint).removeGroup({ groupId });
        if (status !== Status.Success) {
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
