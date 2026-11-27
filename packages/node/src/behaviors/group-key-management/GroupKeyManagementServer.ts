/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeLifecycle } from "#node/NodeLifecycle.js";
import { deepCopy, Immutable, ImplementationError, isDeepEqual, Logger } from "@matter/general";
import { FieldElement } from "@matter/model";
import {
    assertRemoteActor,
    Fabric,
    FabricManager,
    GroupMulticastPolicy,
    hasRemoteActor,
    IPK_DEFAULT_EPOCH_START_TIME,
} from "@matter/protocol";
import {
    EndpointNumber,
    FabricIndex,
    GroupId,
    MATTER_EPOCH_OFFSET_US,
    Status,
    StatusResponseError,
} from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { GroupKeyManagementBehavior } from "./GroupKeyManagementBehavior.js";

const logger = Logger.get("GroupKeyManagementServer");

const MAX_64BIT_TIME = BigInt("0xffffffffffffffff");

/** Per core§11.27.7.1.4 a Groupcast-created GroupKeySet has EpochStartTime0=1 (internal times are unix-epoch based). */
const GROUPCAST_KEY_EPOCH_START_TIME = MATTER_EPOCH_OFFSET_US + BigInt(1);

const GroupKeyManagementBase = GroupKeyManagementBehavior;

// Enhance the schema by a fabric scoped structure for the GroupKeySetStruct to enable persistence
const groupKeySetStruct = GroupKeyManagementBase.schema.datatypes.require("GroupKeySetStruct");
const groupKeySetStructFS = groupKeySetStruct.extend(
    {
        name: "GroupKeySetStructFS",
    },
    FieldElement({ name: "FabricIndex", id: 0xfe, type: "FabricIndex", conformance: "M" }),
);
// GroupKeyMulticastPolicy has no effect here; it is reported as the PerGroupID default until the field is obsolete
const reportsMulticastPolicy = !groupKeySetStruct.fields.require("GroupKeyMulticastPolicy").isObsolete;

const schema = GroupKeyManagementBase.schema.extend(
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

/** Role of the transaction participant that syncs the {@link FabricGroups} after the commit. */
const fabricGroupsSyncRole = {};

/**
 * Set the key sets, the group key id map, the endpoint map and, given {@link multicastPolicies}, the multicast address
 * policies in the {@link FabricGroups} of every fabric to the entries of the fabric in {@link state}.
 *
 * Additions come before the maps that refer to them and removals after, so a group never maps to a key set the fabric
 * does not hold, and its multicast membership never moves to an interim address.  Unchanged key sets keep their derived
 * keys and their message reception state.
 */
async function syncFabricGroups(
    fabrics: FabricManager,
    state: Immutable<Pick<GroupKeyManagementServer.State, "groupKeySets" | "groupKeyMap" | "groupTable">>,
    multicastPolicies?: GroupKeyManagementServer.MulticastPolicies,
) {
    for (const { fabricIndex, groups } of fabrics) {
        const policies = multicastPolicies?.(fabricIndex);
        for (const [groupId, policy] of policies ?? []) {
            groups.setGroupMulticastPolicy(groupId, policy);
        }

        const keySets = state.groupKeySets.filter(entry => entry.fabricIndex === fabricIndex);
        for (const { fabricIndex: _fabricIndex, ...keySet } of keySets) {
            if (!isDeepEqual(groups.keySets.asGroupKeySet(keySet.groupKeySetId), keySet, true)) {
                await groups.setFromGroupKeySet(deepCopy(keySet));
            }
        }

        groups.groupKeyIdMap = new Map(
            state.groupKeyMap
                .filter(entry => entry.fabricIndex === fabricIndex)
                .map(({ groupId, groupKeySetId }) => [groupId, groupKeySetId]),
        );

        const { endpoints } = groups;
        const groupTable = state.groupTable.filter(entry => entry.fabricIndex === fabricIndex);
        const groupIds = new Set(groupTable.map(({ groupId }) => groupId));
        for (const groupId of [...endpoints.keys()]) {
            if (!groupIds.has(groupId)) {
                endpoints.delete(groupId);
            }
        }
        for (const { groupId, endpoints: groupEndpoints } of groupTable) {
            endpoints.set(groupId, [...groupEndpoints]);
        }

        const keySetIds = new Set(keySets.map(({ groupKeySetId }) => groupKeySetId));
        for (const { groupKeySetId } of [...groups.keySets]) {
            // Key set 0 is the IPK, which the fabric holds itself
            if (groupKeySetId !== 0 && !keySetIds.has(groupKeySetId)) {
                groups.removeGroupKeySet(groupKeySetId);
            }
        }

        if (policies !== undefined) {
            for (const groupId of [...groups.multicastPolicy.keys()]) {
                if (!policies.has(groupId)) {
                    groups.removeGroupMulticastPolicy(groupId);
                }
            }
        }
    }
}

function withoutMulticastPolicy<T extends GroupKeyManagement.GroupKeySet>({
    groupKeyMulticastPolicy: _policy,
    ...keySet
}: T): Omit<T, "groupKeyMulticastPolicy"> {
    return keySet;
}

/**
 * This is the default server implementation of {@link GroupKeyManagementBehavior}.
 */
export class GroupKeyManagementServer extends GroupKeyManagementBase {
    declare internal: GroupKeyManagementServer.Internal;
    declare readonly state: GroupKeyManagementServer.State;
    static override readonly schema = schema;

    override initialize() {
        if (this.features.cacheAndSync) {
            throw new ImplementationError("The CacheAndSync feature is provisional. Do not use it.");
        }

        // TODO: remove this guard once the Groupcast feature leaves provisional state in the Matter specification
        if (this.features.groupcast) {
            throw new ImplementationError(
                "The Groupcast feature of GroupKeyManagement is provisional in Matter 1.6.1. Do not enable it.",
            );
        }

        // Key sets stored by earlier versions still carry the multicast policy
        if (this.state.groupKeySets.some(({ groupKeyMulticastPolicy }) => groupKeyMulticastPolicy !== undefined)) {
            this.state.groupKeySets = this.state.groupKeySets.map(withoutMulticastPolicy);
        }

        // Validate the state
        this.reactTo(this.events.groupKeyMap$Changing, this.#validateGroupKeyMap);
        this.reactTo(this.events.groupTable$Changing, this.#validateGroupTable);

        this.reactTo(this.events.groupKeyMap$Changing, this.syncFabricGroupsAfterCommit);
        this.reactTo(this.events.groupTable$Changing, this.syncFabricGroupsAfterCommit);

        const lifecycle = this.endpoint.lifecycle as NodeLifecycle;
        this.reactTo(lifecycle.online, this.#online);
    }

    async #online() {
        // Validate the maximum supported group keys and groups per fabric if they are set to minimum values.
        if (this.state.maxGroupKeysPerFabric === 1 && this.state.maxGroupsPerFabric === 0) {
            // We assume these are the specification defaults: maxGroupKeysPerFabric = 1, maxGroupsPerFabric = 0
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

        const groupKeySets = this.state.groupKeySets.filter(({ fabricIndex }) => fabrics.has(fabricIndex));
        if (groupKeySets.length !== this.state.groupKeySets.length) {
            // Should normally not happen, but we saw such crashes without details, so handle it gracefully
            const staleFabrics = new Set(
                this.state.groupKeySets.map(({ fabricIndex }) => fabricIndex).filter(index => !fabrics.has(index)),
            );
            logger.warn(
                `Stored GroupKeySets for FabricIndex ${[...staleFabrics].join(", ")}, but no such fabric exists anymore. Cleaning up stale entries.`,
            );
            this.state.groupKeySets = deepCopy(groupKeySets);
        }

        const { state, internal } = this;
        const sync = () => syncFabricGroups(fabrics, state, internal.multicastPolicies);
        await (internal.fabricGroupsSync = internal.fabricGroupsSync.then(sync, sync));
    }

    /**
     * Bring the {@link FabricGroups} of every fabric in line with the committed state once the current transaction
     * concludes, including the multicast policies of {@link setMulticastPolicies}.  A transaction that rolls back
     * leaves them unchanged.  The sync completes before the commit of the transaction resolves, so before the response
     * to the command or write that changed the state.
     *
     * Call it from every transaction that changes a source of the {@link FabricGroups}, before the transaction commits;
     * a call from a post-commit reactor is too late for this commit.  Writes to GroupKeyMap and GroupTable call it
     * themselves, the key set handlers call it explicitly.  Calling it more than once in a transaction has no further
     * effect.
     */
    syncFabricGroupsAfterCommit() {
        const { transaction } = this.context;
        if (transaction.getParticipant(fabricGroupsSyncRole) !== undefined) {
            return;
        }

        const { endpoint, internal } = this;
        const fabrics = this.env.get(FabricManager);
        const sync = () =>
            syncFabricGroups(fabrics, endpoint.stateOf(GroupKeyManagementServer), internal.multicastPolicies);
        transaction.addParticipants({
            role: fabricGroupsSyncRole,
            toString: () => `${endpoint}.groupKeyManagement.fabricGroups`,

            // One sync runs at a time and reads the state when it starts, so it never installs a state that an
            // overlapping commit replaced
            conclusion: outcome => {
                if (outcome !== "rolled back") {
                    return (internal.fabricGroupsSync = internal.fabricGroupsSync.then(sync, sync));
                }
            },
        });
    }

    /**
     * Make the multicast address policies of {@link policies} part of the {@link FabricGroups} sync.  A group without a
     * policy then uses its per-group address.  Used by GroupcastServer, which derives the policies from its committed
     * membership.
     */
    setMulticastPolicies(policies: GroupKeyManagementServer.MulticastPolicies) {
        this.internal.multicastPolicies = policies;
    }

    #validateGroupKeyMap(groupKeyMap: GroupKeyManagement.GroupKeyMap[]) {
        // When GCAST is active and the fabric has adopted Groupcast, GroupKeyMap is read-only
        if (this.features.groupcast && hasRemoteActor(this.context)) {
            const fabricIndex = this.context.session?.fabric?.fabricIndex;
            if (fabricIndex !== undefined && this.#isGroupcastAdoptedForFabric(fabricIndex)) {
                throw new StatusResponseError(
                    "GroupKeyMap is read-only when GroupcastAdoption.GroupcastAdopted is true",
                    Status.InvalidInState,
                );
            }
        }

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
                    Status.InvalidAction,
                );
            }

            groupIdsPerFabric[fabricIndex] = (groupIdsPerFabric[fabricIndex] ?? 0) + 1;
            const id = `${fabricIndex}-${groupId}`;
            if (knownGroupIds.has(id)) {
                throw new StatusResponseError(
                    `Duplicate GroupId ${groupId} for FabricIndex ${fabricIndex}`,
                    Status.ConstraintError,
                );
            }
            knownGroupIds.add(id);

            // The spec does not mandate to check if a key set exists where a group is added for and Tests also try it
            /*const keyId = `${fabricIndex}-${groupKeySetId}`;
            if (!knownGroupKeys.has(keyId)) {
                throw new StatusResponseError(
                    `GroupKeySetId ${groupKeySetId} for FabricIndex ${fabricIndex} not found`,
                    Status.ConstraintError,
                );
            }*/
        }
        if (groupIdsPerFabric.some(count => count > this.state.maxGroupsPerFabric)) {
            throw new StatusResponseError(
                `Too many groups per fabric, maximum is ${this.state.maxGroupsPerFabric}`,
                Status.ResourceExhausted,
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
                    Status.ConstraintError,
                );
            }

            const id = `${fabricIndex}-${groupId}`;
            if (knownGroupIds.has(id)) {
                throw new StatusResponseError(
                    `Duplicate GroupId ${groupId} for FabricIndex ${fabricIndex}`,
                    Status.ConstraintError,
                );
            }
            knownGroupIds.add(id);

            const endpointIds = new Set<number>(endpoints);
            if (endpointIds.size !== endpoints.length) {
                throw new StatusResponseError(
                    `Duplicate endpoint IDs in GroupId ${groupId} for FabricIndex ${fabricIndex}`,
                    Status.ConstraintError,
                );
            }
        }
    }

    override keySetWrite({ groupKeySet }: GroupKeyManagement.KeySetWriteRequest) {
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
            throw new StatusResponseError("EpochKey0 and EpochStartTime0 must be set", Status.InvalidCommand);
        }
        if (epochStartTime0 <= IPK_DEFAULT_EPOCH_START_TIME) {
            // Formally can never be < IPK_DEFAULT_EPOCH_START_TIME, but let's be sure
            throw new StatusResponseError("EpochStartTime0 must not be 0", Status.InvalidCommand);
        }

        if (epochKey1 !== null && (epochStartTime1 === null || epochStartTime1 <= epochStartTime0)) {
            throw new StatusResponseError(
                "EpochStartTime1 must be set and greater than EpochStartTime0",
                Status.InvalidCommand,
            );
        }
        if (epochKey1 === null && epochStartTime1 !== null) {
            throw new StatusResponseError("EpochKey1 must be set if EpochStartTime1 is set", Status.InvalidCommand);
        }

        if (epochKey2 !== null && epochKey1 === null) {
            throw new StatusResponseError("EpochKey1 must be set if EpochKey2 is set", Status.InvalidCommand);
        }
        if (
            epochKey2 !== null &&
            (epochStartTime2 === null || epochStartTime1 === null || epochStartTime2 <= epochStartTime1)
        ) {
            throw new StatusResponseError(
                "EpochStartTime2 must be set and greater than EpochStartTime1",
                Status.InvalidCommand,
            );
        }
        if (epochKey2 === null && epochStartTime2 !== null) {
            throw new StatusResponseError("EpochKey2 must be set if EpochStartTime2 is set", Status.InvalidCommand);
        }

        if (groupKeySecurityPolicy !== GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst) {
            throw new StatusResponseError("GroupKeySecurityPolicy must be TrustFirst", Status.InvalidCommand);
        }

        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const keySet = withoutMulticastPolicy(groupKeySet);

        this.syncFabricGroupsAfterCommit();

        // Replace or add the group key set to the internal persisted state
        const existingIndex = this.state.groupKeySets.findIndex(
            ({ groupKeySetId: entryId, fabricIndex: entryIndex }) =>
                entryIndex === fabricIndex && entryId === groupKeySetId,
        );
        if (existingIndex !== -1) {
            // Update existing group key set
            this.state.groupKeySets[existingIndex] = { ...keySet, fabricIndex };
        } else {
            // Add a new group key set
            const keySetsOfFabric =
                this.state.groupKeySets.filter(({ fabricIndex: entryIndex }) => entryIndex === fabricIndex).length + 1; // Add 1 because Group Key set 0 for IPK always exists implicitly
            if (keySetsOfFabric >= this.state.maxGroupKeysPerFabric) {
                throw new StatusResponseError(
                    `Too many group key sets for fabric ${fabricIndex}, maximum is ${this.state.maxGroupKeysPerFabric}`,
                    Status.ResourceExhausted,
                );
            }
            this.state.groupKeySets.push({ ...keySet, fabricIndex });
        }
    }

    override keySetRead({
        groupKeySetId,
    }: GroupKeyManagement.KeySetReadRequest): GroupKeyManagement.KeySetReadResponse {
        assertRemoteActor(this.context);

        const fabric = this.context.session.associatedFabric;

        // We use the fabric group manager to retrieve the group key set because he also has the id 0 and is synced anyway
        const groupKeySet = fabric.groups.keySets.asGroupKeySet(groupKeySetId);
        if (groupKeySet === undefined) {
            throw new StatusResponseError(`GroupKeySet ${groupKeySetId} not found`, Status.NotFound);
        }

        return {
            groupKeySet: {
                ...groupKeySet,
                epochKey0: null,
                epochKey1: null,
                epochKey2: null,
                ...(reportsMulticastPolicy
                    ? { groupKeyMulticastPolicy: GroupKeyManagement.GroupKeyMulticastPolicy.PerGroupId }
                    : {}),
            },
        };
    }

    override keySetRemove({ groupKeySetId }: GroupKeyManagement.KeySetRemoveRequest) {
        if (groupKeySetId === 0) {
            throw new StatusResponseError(`GroupKeySet ${groupKeySetId} cannot be removed`, Status.InvalidCommand);
        }

        assertRemoteActor(this.context);

        const fabricIndex = this.context.session.associatedFabric.fabricIndex;

        // Remove the group key set from the internal persisted state
        const existingIndex = this.state.groupKeySets.findIndex(
            ({ groupKeySetId: entryId, fabricIndex: entryIndex }) =>
                entryIndex === fabricIndex && entryId === groupKeySetId,
        );
        if (existingIndex === -1) {
            throw new StatusResponseError(`GroupKeySet ${groupKeySetId} not found`, Status.NotFound);
        }
        this.syncFabricGroupsAfterCommit();
        this.state.groupKeySets.splice(existingIndex, 1);

        // Per core§11.2.7.4.1: GroupKeyMap entries for the accessing fabric that refer to the removed key set SHALL be
        // removed from the list.
        this.state.groupKeyMap = this.state.groupKeyMap.filter(
            entry => entry.fabricIndex !== fabricIndex || entry.groupKeySetId !== groupKeySetId,
        );
    }

    override keySetReadAllIndices(): GroupKeyManagement.KeySetReadAllIndicesResponse {
        assertRemoteActor(this.context);

        const fabric = this.context.session.associatedFabric;
        const fabricIndex = fabric.fabricIndex;

        const groupKeySetIds = this.state.groupKeySets
            .filter(({ fabricIndex: entryIndex }) => entryIndex === fabricIndex)
            .map(({ groupKeySetId }) => groupKeySetId);
        groupKeySetIds.unshift(0); // Always include the group key set 0

        return {
            groupKeySetIds,
        };
    }

    /**
     * Add {@link endpointId} to the group table entry of {@link groupId}, creating the entry if needed.
     *
     * {@link groupName} is the last name written for the group via the Groups cluster; leave it out for a group that has
     * none, such as one that Groupcast JoinGroup created.
     *
     * @see {@link MatterSpecification.v161.Core} § 11.2.5.5.3
     */
    addEndpointForGroup(fabric: Fabric, groupId: GroupId, endpointId: EndpointNumber, groupName?: string): void {
        const fabricIndex = fabric.fabricIndex;
        // Add the group to the group table
        const existingGroupIndex = this.state.groupTable.findIndex(
            entry => entry.groupId === groupId && entry.fabricIndex === fabricIndex,
        );
        if (existingGroupIndex !== -1) {
            // If the group already exists, add the endpoint
            if (!this.state.groupTable[existingGroupIndex].endpoints.includes(endpointId)) {
                this.state.groupTable[existingGroupIndex].endpoints.push(endpointId);
            }
            this.state.groupTable[existingGroupIndex].groupName = groupName;
        } else {
            if (
                this.state.groupTable.filter(({ fabricIndex: entryFabricIndex }) => entryFabricIndex === fabricIndex)
                    .length >= this.state.maxGroupsPerFabric
            ) {
                throw new StatusResponseError(
                    `Too many groups for fabric ${fabricIndex}, maximum is ${this.state.maxGroupsPerFabric}`,
                    Status.ResourceExhausted,
                );
            }

            // Create a new group entry
            this.state.groupTable.push({
                groupId,
                endpoints: [endpointId],
                groupName,
                fabricIndex,
            });
        }
        logger.info(
            `Added endpoint ${endpointId} to group ${groupId} on fabric ${fabricIndex}`,
            ...(groupName === undefined ? [] : [`with name "${groupName}"`]),
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
                    // If no endpoints left, remove the group entry
                    groupTable.splice(i, 1);
                } else {
                    entry.endpoints = entry.endpoints.filter(id => id !== endpointId);
                }
                existing = true;
            }
        }
        return existing;
    }

    #isGroupcastAdoptedForFabric(fabricIndex: FabricIndex): boolean {
        if (!this.features.groupcast) return false;
        if (!this.state.groupcastAdoption) return false;
        return this.state.groupcastAdoption.some(entry => entry.fabricIndex === fabricIndex && entry.groupcastAdopted);
    }

    /**
     * Returns whether a GroupKeySetId exists for a given fabric. Called by GroupcastServer to validate KeySetIDs.
     */
    validateKeySetId(fabricIndex: FabricIndex, keySetId: number): boolean {
        if (keySetId === 0) {
            // IPK key set always exists
            return true;
        }
        return this.state.groupKeySets.some(
            entry => entry.fabricIndex === fabricIndex && entry.groupKeySetId === keySetId,
        );
    }

    /**
     * Creates a new GroupKeySet for a Groupcast group key, bypassing normal KeySetWrite validation.
     * Used by GroupcastServer when JoinGroup or UpdateGroupKey is called with a `key` parameter.
     * The key set uses TrustFirst policy and EpochStartTime0=1 as required by core§11.27.7.1.4.
     *
     * The key set becomes usable for group messages when the transaction commits.  Rejects with a
     * {@link StatusResponseError} with ResourceExhausted when the fabric holds the maximum number of key sets.
     */
    async createKeySetForGroupcast(fabric: Fabric, keySetId: number, epochKey0: Uint8Array): Promise<void> {
        const fabricIndex = fabric.fabricIndex;
        const keySetsOfFabric = this.state.groupKeySets.filter(({ fabricIndex: fi }) => fi === fabricIndex).length + 1;
        if (keySetsOfFabric >= this.state.maxGroupKeysPerFabric) {
            throw new StatusResponseError(
                `Too many group key sets for fabric ${fabricIndex}`,
                Status.ResourceExhausted,
            );
        }
        const groupKeySet: GroupKeyManagement.GroupKeySet & { fabricIndex: FabricIndex } = {
            groupKeySetId: keySetId,
            groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
            epochKey0,
            epochStartTime0: GROUPCAST_KEY_EPOCH_START_TIME,
            epochKey1: null,
            epochStartTime1: null,
            epochKey2: null,
            epochStartTime2: null,
            fabricIndex,
        };
        this.syncFabricGroupsAfterCommit();
        this.state.groupKeySets.push(groupKeySet);
    }

    setGroupcastAdopted(fabricIndex: FabricIndex, adopted: boolean) {
        if (!this.state.groupcastAdoption) return;
        const existing = this.state.groupcastAdoption.findIndex(e => e.fabricIndex === fabricIndex);
        if (existing !== -1) {
            this.state.groupcastAdoption[existing] = {
                ...this.state.groupcastAdoption[existing],
                groupcastAdopted: adopted,
            };
        } else {
            this.state.groupcastAdoption.push({ fabricIndex, groupcastAdopted: adopted });
        }
    }
}

export namespace GroupKeyManagementServer {
    export class Internal {
        /** Settles when the last started sync of the {@link FabricGroups} with the committed state completes. */
        fabricGroupsSync: Promise<void> = Promise.resolve();

        multicastPolicies?: MulticastPolicies;
    }

    /** Returns the committed multicast address policy of every group of a fabric that has one. */
    export type MulticastPolicies = (fabricIndex: FabricIndex) => Map<GroupId, GroupMulticastPolicy>;

    export class State extends GroupKeyManagementBase.State {
        /**
         * Extended state to hold and persist the group key sets for this server. This structure contains all
         * GroupKeySet entries for all fabrics beside the fabric specific entries of the groupKeyset 0
         */
        groupKeySets: (GroupKeyManagement.GroupKeySet & { fabricIndex: FabricIndex })[] = [];

        // Overwrite defaults to allow more than 3 group keys and 4 groups per fabric, because we can
        override maxGroupKeysPerFabric = 20; // The Minimum would be 3;
        override maxGroupsPerFabric = 22; // The Minimum would be 4. Aligned with Groupcast quota=floor(44/2).

        /**
         * Per-fabric Groupcast adoption state.  Only present when the Groupcast feature is enabled and the optional
         * GroupcastAdoption attribute is defined; the default server never populates it.
         */
        declare groupcastAdoption?: GroupKeyManagement.GroupcastAdoption[];
    }
}
