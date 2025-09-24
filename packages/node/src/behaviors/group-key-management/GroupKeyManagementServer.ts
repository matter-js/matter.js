/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { GroupKeyManagement } from "#clusters/group-key-management";
import { deepCopy, ImplementationError, Logger, MaybePromise } from "#general";
import { DatatypeModel, FieldElement } from "#model";
import { NodeLifecycle } from "#node/NodeLifecycle.js";
import { assertRemoteActor, Fabric, FabricManager, hasRemoteActor } from "#protocol";
import { EndpointNumber, FabricIndex, GroupId, StatusCode, StatusResponseError } from "#types";
import { GroupKeyManagementBehavior } from "./GroupKeyManagementBehavior.js";

const logger = Logger.get("GroupKeyManagementServer");

const MAX_64BIT_TIME = BigInt("0xffffffffffffffff");

// Enhance the schema by a fabric scoped structure for the GroupKeySetStruct to enable persistence
const groupKeySetStruct = GroupKeyManagementBehavior.schema!.get(DatatypeModel, "GroupKeySetStruct")!;
const groupKeySetStructFS = groupKeySetStruct.extend(
    {
        name: "GroupKeySetStructFS",
    },
    FieldElement({ name: "FabricIndex", id: 0xfe, type: "FabricIndex", conformance: "M" }),
);
const schema = GroupKeyManagementBehavior.schema!.extend(
    {},
    groupKeySetStructFS,
    FieldElement(
        {
            name: "groupKeySets",
            type: "list",
            quality: "N",
            access: "RW VM F",
            conformance: "M",
        },
        FieldElement({ name: "entry", type: "GroupKeySetStructFS" }),
    ),
);

/**
 * This is the default server implementation of {@link GroupKeyManagementBehavior}.
 */
export class GroupKeyManagementServer extends GroupKeyManagementBehavior {
    declare state: GroupKeyManagementServer.State;
    static override readonly schema = schema;

    override initialize(): MaybePromise {
        if (this.features.cacheAndSync) {
            throw new ImplementationError("The CacheAndSync feature is provisional. Do not use it.");
        }

        // Validate the state
        this.reactTo(this.events.groupKeyMap$Changing, this.#validateGroupKeyMap);
        this.reactTo(this.events.groupTable$Changing, this.#validateGroupTable);

        // Update the group key map when the group key sets change
        this.reactTo(this.events.groupKeyMap$Changed, this.#updateGroupKeyMap);

        const lifecycle = this.endpoint.lifecycle as NodeLifecycle;
        this.reactTo(lifecycle.online, this.#online);
    }

    async #online() {
        // Validate the maximum supported group keys and groups per fabric if they are set to minimum values.
        if (this.state.maxGroupKeysPerFabric === 0 && this.state.maxGroupsPerFabric === 1) {
            // We assume unchanged defaults
            let groupsFound = false;
            this.endpoint.visit(endpoint => {
                if (!groupsFound && "groups" in endpoint.behaviors.supported) {
                    groupsFound = true;
                }
            });
            if (groupsFound) {
                throw new ImplementationError(
                    "One of the device types you use has a Groups cluster. Please adjust the Group Key Management cluster maximum defaults. You need to support groups management.",
                );
            }
        }

        const fabrics = this.env.get(FabricManager);

        // TODO handle delete fabric more generically later to remove fabric scoped data
        // Added fabric always have no groups, so no need to initialize anything on adding the fabric

        // Fabric was updated, so basically newly created, so we need to reinitialize the group key sets
        this.reactTo(fabrics.events.updated, this.#handleFabricUpdate);

        // When we have group key sets, we need to ensure that they are initialized on the Fabric group manager
        if (this.state.groupKeySets.length) {
            const groupKeysForFabric = new Map<FabricIndex, GroupKeyManagement.GroupKeySet[]>();
            for (const groupKeySet of this.state.groupKeySets) {
                const fabricIndex = groupKeySet.fabricIndex;
                const keys = groupKeysForFabric.get(fabricIndex) ?? [];
                keys.push(groupKeySet);
                groupKeysForFabric.set(fabricIndex, keys);
            }

            for (const [fabricIndex, keys] of groupKeysForFabric.entries()) {
                const fabric = fabrics.for(fabricIndex);
                for (const groupKeySet of keys) {
                    await fabric.groups.setFromGroupKeySet(groupKeySet);
                }
            }
        }
        if (this.state.groupKeyMap.length) {
            this.#updateGroupKeyMap(this.state.groupKeyMap);
        }
    }

    /** Handle the recreation (update) of a fabric, so we need to reinitialize the group key sets */
    async #handleFabricUpdate(fabric: Fabric) {
        if (this.state.groupKeySets.length === 0) {
            return; // No group key sets, so nothing to do
        }
        const fabricIndex = fabric.fabricIndex;
        const groupKeysForFabric = this.state.groupKeySets.filter(
            ({ fabricIndex: entryIndex }) => entryIndex === fabricIndex,
        );
        for (const groupKeySet of groupKeysForFabric) {
            await fabric.groups.setFromGroupKeySet(groupKeySet);
        }
        if (this.state.groupKeyMap.length) {
            fabric.groups.groupKeyIdMap = new Map<GroupId, number>(
                this.state.groupKeyMap
                    .filter(({ fabricIndex: entryIndex }) => entryIndex === fabricIndex)
                    .map(({ groupId, groupKeySetId }) => [groupId, groupKeySetId]),
            );
        }
        if (this.state.groupTable.length) {
            // Initialize the group table for the fabric
            const groupTable = this.state.groupTable.filter(
                ({ fabricIndex: entryIndex }) => entryIndex === fabricIndex,
            );
            fabric.groups.endpoints.clear();
            for (const entry of groupTable) {
                fabric.groups.endpoints.set(entry.groupId, entry.endpoints);
            }
        }
    }

    #validateGroupKeyMap(groupKeyMap: GroupKeyManagement.GroupKeyMap[]) {
        const knownGroupKeys = new Set<string>();
        for (const keySetId of this.state.groupKeySets) {
            const { groupKeySetId, fabricIndex } = keySetId;
            const id = `${fabricIndex}-${groupKeySetId}`;
            knownGroupKeys.add(id);
        }

        const knownGroupIds = new Set<string>();
        const groupIdsPerFabric = new Array<number>();
        for (const entry of groupKeyMap) {
            const { groupId, fabricIndex } = entry;
            if (!GroupId.isApplicationGroupId(groupId)) {
                throw new StatusResponseError(
                    "Only operational GroupIds are allowed in GroupKeyMap",
                    StatusCode.InvalidAction,
                );
            }

            groupIdsPerFabric[fabricIndex] = (groupIdsPerFabric[fabricIndex] ?? 0) + 1;
            const id = `${fabricIndex}-${groupId}`;
            if (knownGroupIds.has(id)) {
                throw new StatusResponseError(
                    `Duplicate GroupId ${groupId} for FabricIndex ${fabricIndex}`,
                    StatusCode.ConstraintError,
                );
            }
            knownGroupIds.add(id);

            // The spec does not mandate to check if a key set exists where a group is added for and Tests also try it
            /*const keyId = `${fabricIndex}-${groupKeySetId}`;
            if (!knownGroupKeys.has(keyId)) {
                throw new StatusResponseError(
                    `GroupKeySetId ${groupKeySetId} for FabricIndex ${fabricIndex} not found`,
                    StatusCode.ConstraintError,
                );
            }*/
        }
        if (groupIdsPerFabric.some(count => count > this.state.maxGroupsPerFabric)) {
            throw new StatusResponseError(
                `Too many groups per fabric, maximum is ${this.state.maxGroupsPerFabric}`,
                StatusCode.ResourceExhausted,
            );
        }
    }

    #validateGroupTable(groupTable: GroupKeyManagement.GroupInfoMap[]) {
        const knownGroupIds = new Set<string>();
        for (const entry of groupTable) {
            const { groupId, fabricIndex, endpoints } = entry;
            if (groupId === 0) {
                throw new StatusResponseError(
                    "GroupId 0 can not be used as operational group id",
                    StatusCode.ConstraintError,
                );
            }

            const id = `${fabricIndex}-${groupId}`;
            if (knownGroupIds.has(id)) {
                throw new StatusResponseError(
                    `Duplicate GroupId ${groupId} for FabricIndex ${fabricIndex}`,
                    StatusCode.ConstraintError,
                );
            }
            knownGroupIds.add(id);

            const endpointIds = new Set<number>(endpoints);
            if (endpointIds.size !== endpoints.length) {
                throw new StatusResponseError(
                    `Duplicate endpoint IDs in GroupId ${groupId} for FabricIndex ${fabricIndex}`,
                    StatusCode.ConstraintError,
                );
            }
        }
    }

    #updateGroupKeyMap(
        groupKeyMap: GroupKeyManagement.GroupKeyMap[],
        _oldMap?: GroupKeyManagement.GroupKeyMap[],
        context?: ActionContext,
    ) {
        if (context !== undefined && hasRemoteActor(context)) {
            const fabric = context.session?.associatedFabric;
            const fabricIndex = fabric?.fabricIndex;

            // Online context, so we can just update the relevant fabric
            if (fabric !== undefined && fabricIndex !== undefined) {
                fabric.groups.groupKeyIdMap = new Map<GroupId, number>(
                    groupKeyMap
                        .filter(({ fabricIndex: entryIndex }) => entryIndex === fabricIndex)
                        .map(({ groupId, groupKeySetId }) => [groupId, groupKeySetId]),
                );
                return;
            }
        }

        const fabrics = this.env.get(FabricManager);
        const fabricMaps = new Map<FabricIndex, Map<GroupId, number>>();
        for (const entry of groupKeyMap) {
            const { fabricIndex, groupId, groupKeySetId } = entry;

            const fabricMap = fabricMaps.get(fabricIndex) ?? new Map<GroupId, number>();
            fabricMap.set(groupId, groupKeySetId);
            fabricMaps.set(fabricIndex, fabricMap);
        }
        for (const fabric of fabrics) {
            const fabricIndex = fabric.fabricIndex;
            const map = fabricMaps.get(fabricIndex);
            if (map === undefined) {
                continue;
            }
            fabric.groups.groupKeyIdMap = map;
        }
    }

    override async keySetWrite({ groupKeySet }: GroupKeyManagement.KeySetWriteRequest) {
        assertRemoteActor(this.context);

        const {
            groupKeySetId,
            epochKey0,
            epochKey1,
            epochKey2,
            epochStartTime0,
            epochStartTime1,
            epochStartTime2,
            groupKeySecurityPolicy,
            groupKeyMulticastPolicy = GroupKeyManagement.GroupKeyMulticastPolicy.PerGroupId,
        } = groupKeySet;

        // Unclear if that should be checked here, but it basically only makes sense here
        // An epoch key marked with the maximum start time SHALL be disabled and render the corresponding epoch
        // key slot unused.
        if (groupKeySet.epochStartTime0 === MAX_64BIT_TIME) {
            groupKeySet.epochStartTime0 = null;
            groupKeySet.epochKey0 = null;
        }
        if (groupKeySet.epochStartTime1 === MAX_64BIT_TIME) {
            groupKeySet.epochStartTime1 = null;
            groupKeySet.epochKey1 = null;
        }
        if (groupKeySet.epochStartTime2 === MAX_64BIT_TIME) {
            groupKeySet.epochStartTime2 = null;
            groupKeySet.epochKey2 = null;
        }

        if (epochKey0 === null || epochStartTime0 === null) {
            throw new StatusResponseError("EpochKey0 and EpochStartTime0 must be set", StatusCode.InvalidCommand);
        }
        if (epochStartTime0 === 0) {
            throw new StatusResponseError("EpochStartTime0 must not be 0", StatusCode.InvalidCommand);
        }

        if (epochKey1 !== null && (epochStartTime1 === null || epochStartTime1 <= epochStartTime0)) {
            throw new StatusResponseError(
                "EpochStartTime1 must be set and greater than EpochStartTime0",
                StatusCode.InvalidCommand,
            );
        }
        if (epochKey1 === null && epochStartTime1 !== null) {
            throw new StatusResponseError("EpochKey1 must be set if EpochStartTime1 is set", StatusCode.InvalidCommand);
        }

        if (epochKey2 !== null && epochKey1 === null) {
            throw new StatusResponseError("EpochKey1 must be set if EpochKey2 is set", StatusCode.InvalidCommand);
        }
        if (
            epochKey2 !== null &&
            (epochStartTime2 === null || epochStartTime1 === null || epochStartTime2 <= epochStartTime1)
        ) {
            throw new StatusResponseError(
                "EpochStartTime2 must be set and greater than EpochStartTime1",
                StatusCode.InvalidCommand,
            );
        }
        if (epochKey2 === null && epochStartTime2 !== null) {
            throw new StatusResponseError("EpochKey2 must be set if EpochStartTime2 is set", StatusCode.InvalidCommand);
        }

        if (groupKeySecurityPolicy !== GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst) {
            throw new StatusResponseError("GroupKeySecurityPolicy must be TrustFirst", StatusCode.InvalidCommand);
        }

        // GroupKeyMulticastPolicy is provisional and PerGroupId is the default, so do not allow other values for now
        if (groupKeyMulticastPolicy !== GroupKeyManagement.GroupKeyMulticastPolicy.PerGroupId) {
            throw new StatusResponseError("GroupKeyMulticastPolicy must be PerGroupId", StatusCode.InvalidCommand);
        }

        const fabric = this.context.session.associatedFabric;
        const fabricIndex = fabric.fabricIndex;

        // Replace or add the group key set to the internal persisted state
        const existingIndex = this.state.groupKeySets.findIndex(
            ({ groupKeySetId: entryId, fabricIndex: entryIndex }) =>
                entryIndex === fabricIndex && entryId === groupKeySetId,
        );
        if (existingIndex !== -1) {
            // Update existing group key set
            this.state.groupKeySets[existingIndex] = { ...groupKeySet, fabricIndex };
        } else {
            // Add new group key set
            const keySetsOfFabric = this.state.groupKeySets.filter(
                ({ fabricIndex: entryIndex }) => entryIndex === fabricIndex,
            ).length;
            if (keySetsOfFabric >= this.state.maxGroupKeysPerFabric) {
                throw new StatusResponseError(
                    `Too many group key sets for fabric ${fabricIndex}, maximum is ${this.state.maxGroupKeysPerFabric}`,
                    StatusCode.ResourceExhausted,
                );
            }
            this.state.groupKeySets.push({ ...groupKeySet, fabricIndex });
        }

        // Update the Fabric group manager to kick off the internal processes
        await fabric.groups.setFromGroupKeySet(groupKeySet);
    }

    override keySetRead({
        groupKeySetId,
    }: GroupKeyManagement.KeySetReadRequest): GroupKeyManagement.KeySetReadResponse {
        assertRemoteActor(this.context);

        const fabric = this.context.session.associatedFabric;

        // We use the fabric group manager to retrieve the group key set because he also has the id 0 and is synced anyway
        const groupKeySet = fabric.groups.keySets.asGroupKeySet(groupKeySetId);
        if (groupKeySet === undefined) {
            throw new StatusResponseError(`GroupKeySet ${groupKeySetId} not found`, StatusCode.NotFound);
        }

        return {
            groupKeySet: {
                ...groupKeySet,
                epochKey0: null,
                epochKey1: null,
                epochKey2: null,
            },
        };
    }

    override async keySetRemove({ groupKeySetId }: GroupKeyManagement.KeySetRemoveRequest) {
        if (groupKeySetId === 0) {
            throw new StatusResponseError(`GroupKeySet ${groupKeySetId} cannot be removed`, StatusCode.InvalidCommand);
        }

        assertRemoteActor(this.context);

        const fabric = this.context.session.associatedFabric;
        const fabricIndex = fabric.fabricIndex;

        // Replace or add the group key set to the internal persisted state
        const existingIndex = this.state.groupKeySets.findIndex(
            ({ groupKeySetId: entryId, fabricIndex: entryIndex }) =>
                entryIndex === fabricIndex && entryId === groupKeySetId,
        );
        if (existingIndex === -1) {
            throw new StatusResponseError(`GroupKeySet ${groupKeySetId} not found`, StatusCode.NotFound);
        }
        this.state.groupKeySets.splice(existingIndex, 1);

        // If there exist any entries for the accessing fabric within the GroupKeyMap attribute that refer to the
        // GroupKeySetID just removed, then these entries SHALL be removed from that list.
        const groupKeyMap = deepCopy(this.state.groupKeyMap);
        this.state.groupKeyMap = groupKeyMap.filter(({ groupKeySetId: entryId }) => groupKeySetId !== entryId);

        // Sync to Fabric group manager to remove too
        await fabric.groups.removeGroupKeySet(groupKeySetId);
    }

    override keySetReadAllIndices(): GroupKeyManagement.KeySetReadAllIndicesResponse {
        assertRemoteActor(this.context);

        const fabric = this.context.session.associatedFabric;
        const fabricIndex = fabric.fabricIndex;

        const groupKeySetIDs = this.state.groupKeySets
            .filter(({ fabricIndex: entryIndex }) => entryIndex === fabricIndex)
            .map(({ groupKeySetId }) => groupKeySetId);
        groupKeySetIDs.unshift(0); // Always include the group key set 0

        return {
            groupKeySetIDs,
        };
    }

    addEndpointForGroup(fabric: Fabric, groupId: GroupId, endpointId: EndpointNumber, groupName: string): void {
        const fabricIndex = fabric.fabricIndex;
        // Add the group to the group table
        const existingGroupIndex = this.state.groupTable.findIndex(
            entry => entry.groupId === groupId && entry.fabricIndex === fabricIndex,
        );
        if (existingGroupIndex !== -1) {
            // If the group already exists, add the endpoint
            if (!this.state.groupTable[existingGroupIndex].endpoints.includes(endpointId)) {
                this.state.groupTable[existingGroupIndex].endpoints.push(endpointId);
                fabric.groups.endpoints.set(groupId, this.state.groupTable[existingGroupIndex].endpoints);
            }
            this.state.groupTable[existingGroupIndex].groupName = groupName;
        } else {
            if (
                this.state.groupTable.filter(({ fabricIndex: entryFabricIndex }) => entryFabricIndex === fabricIndex)
                    .length >= this.state.maxGroupsPerFabric
            ) {
                throw new StatusResponseError(
                    `Too many groups for fabric ${fabricIndex}, maximum is ${this.state.maxGroupsPerFabric}`,
                    StatusCode.ResourceExhausted,
                );
            }

            // Create a new group entry
            this.state.groupTable.push({
                groupId,
                endpoints: [endpointId],
                groupName,
                fabricIndex,
            });
            fabric.groups.endpoints.set(groupId, [endpointId]);
        }
        logger.info(
            `Added endpoint ${endpointId} to group ${groupId} on fabric ${fabricIndex} with name "${groupName}"`,
        );
    }

    /**
     * Remove endpoint from the provided group, or all groups if no groupId is provided.
     */
    removeEndpoint(fabric: Fabric, endpointId: EndpointNumber, groupId?: GroupId): boolean {
        let existing = false;
        // Remove the endpoint from the group table
        const groupTable = this.state.groupTable;
        const fabricIndex = fabric.fabricIndex;

        // Remove the endpoint from all groups
        for (let i = groupTable.length - 1; i >= 0; i--) {
            const entry = groupTable[i];
            if (entry.fabricIndex !== fabricIndex || (groupId !== undefined && entry.groupId !== groupId)) {
                continue;
            }
            const endpointExists = entry.endpoints.includes(endpointId);
            if (endpointExists) {
                if (entry.endpoints.length === 1 && entry.endpoints[0] === endpointId) {
                    const groupId = entry.groupId;
                    // If no endpoints left, remove the group entry
                    groupTable.splice(i, 1);
                    fabric.groups.endpoints.delete(groupId);
                } else {
                    entry.endpoints = entry.endpoints.filter(id => id !== endpointId);
                    fabric.groups.endpoints.set(entry.groupId, entry.endpoints);
                }
                existing = true;
            }
        }
        return existing;
    }
}

export namespace GroupKeyManagementServer {
    export class State extends GroupKeyManagementBehavior.State {
        /**
         * Extended state to hold and persist the group key sets for this server. This structure contains all
         * GroupKeySet entries for all fabrics beside the fabric specific entries of the groupKeyset 0
         */
        groupKeySets: (GroupKeyManagement.GroupKeySet & { fabricIndex: FabricIndex })[] = [];

        // Overwrite defaults to allow more than 3 group keys and 4 groups per fabric, because we can
        override maxGroupKeysPerFabric = 20; // The Minimum would be 3;
        override maxGroupsPerFabric = 21; // The Minimum would be 4;
    }
}
