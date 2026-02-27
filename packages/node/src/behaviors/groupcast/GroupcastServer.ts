/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControlServer } from "#behaviors/access-control";
import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { AccessControl as AccessControlTypes } from "#clusters/access-control";
import { Groupcast } from "#clusters/groupcast";
import { Bytes, deepCopy, Logger, ObservableValue, Seconds, Time, Timer } from "#general";
import { NodeLifecycle } from "#node/NodeLifecycle.js";
import { assertRemoteActor, Fabric, FabricManager } from "#protocol";
import { EndpointNumber, FabricIndex, GroupId, NodeId, StatusCode, StatusResponseError } from "#types";
import { GroupcastBehavior } from "./GroupcastBehavior.js";

const logger = Logger.get("GroupcastServer");

/**
 * This is the default server implementation of {@link GroupcastBehavior}.
 *
 * The Groupcast cluster is node-scoped and must be placed on the root endpoint.
 * Use {@link GroupcastServer.with} to enable the desired features (e.g. "Listener", "Sender").
 *
 * Key behaviors:
 * - Manages per-fabric group membership (persistent).
 * - Drives {@link FabricGroups} with group-to-key-set mappings and multicast address policy.
 * - Registers an {@link AccessControlServer.AuxAclObservable} to supply synthetic ACL entries for groups
 *   with `hasAuxiliaryAcl=true`. AccessControlServer calls back to collect entries when needed.
 * - On first use by a fabric, marks the fabric as "GroupcastAdopted" in GKM, making GroupKeyMap read-only.
 * - Migrates legacy group data from the Groups cluster on startup.
 */
export class GroupcastServer extends GroupcastBehavior {
    declare internal: GroupcastServer.Internal;

    /** Timer for GroupcastTesting auto-disable. */
    #testingTimer?: Timer;

    override initialize() {
        const lifecycle = this.endpoint.lifecycle as NodeLifecycle;
        this.reactTo(lifecycle.online, this.#online);
    }

    async #online() {
        // Register the aux ACL observable with AccessControlServer so it can subscribe for updates
        this.agent.get(AccessControlServer).registerAuxAclProvider(this.internal.auxAcl);

        const fabrics = this.env.get(FabricManager);

        // Sync FabricGroups for all existing fabrics
        for (const fabric of fabrics) {
            this.#syncFabricGroups(fabric);
        }

        // Migrate legacy Groups cluster data to Groupcast Membership
        await this.#migrate();

        // Update the derived state once after all sync/migration is done
        this.#updateUsedMcastAddrCount();
        this.#emitAuxAcl();

        // Keep in sync as fabrics are added or removed
        this.reactTo(fabrics.events.added, this.#handleFabricAdded);
        this.reactTo(fabrics.events.deleted, this.#handleFabricDeleted);
    }

    override async joinGroup(request: Groupcast.JoinGroupRequest) {
        assertRemoteActor(this.context);
        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const { groupId, endpoints, keySetId, key, useAuxiliaryAcl, replaceEndpoints, mcastAddrPolicy } = request;

        // Validate groupId range
        if (groupId < 1 || groupId > 0xfff7) {
            throw new StatusResponseError("Invalid group ID", StatusCode.ConstraintError);
        }

        // Validate endpoints: ep 0 (root) and ep > 0xFFFE are invalid per spec
        for (const ep of endpoints) {
            if (ep === 0 || ep > 0xfffe) {
                throw new StatusResponseError(`Endpoint ${ep} is invalid`, StatusCode.UnsupportedEndpoint);
            }
        }

        // If LN-only (no SD feature), an empty endpoint list is not allowed
        if (!this.features.sender && endpoints.length === 0) {
            throw new StatusResponseError("Empty endpoint list requires Sender feature", StatusCode.ConstraintError);
        }

        // Validate multicast address policy: PerGroup requires PerGroupAddr feature
        const policy = mcastAddrPolicy ?? Groupcast.MulticastAddrPolicy.IanaAddr;
        if (policy === Groupcast.MulticastAddrPolicy.PerGroup && !this.features.perGroup) {
            throw new StatusResponseError(
                "PerGroup multicast policy requires PerGroupAddr feature",
                StatusCode.ConstraintError,
            );
        }

        const gkm = this.agent.get(GroupKeyManagementServer);
        await this.#applyKeySet(fabricIndex, keySetId, key);

        const membership = deepCopy(this.state.membership);
        const existingIdx = membership.findIndex(m => m.groupId === groupId && m.fabricIndex === fabricIndex);

        if (existingIdx >= 0) {
            // Update existing group membership
            const existing = membership[existingIdx];
            const lnFields = this.features.listener
                ? {
                      endpoints: replaceEndpoints
                          ? endpoints
                          : [...new Set([...(existing.endpoints ?? []), ...endpoints])],
                      hasAuxiliaryAcl: useAuxiliaryAcl ?? existing.hasAuxiliaryAcl,
                  }
                : {};
            membership[existingIdx] = {
                ...existing,
                ...lnFields,
                keySetId,
                mcastAddrPolicy: policy,
            };
        } else {
            // New group: check capacity limits
            const fabricMemberships = membership.filter(m => m.fabricIndex === fabricIndex);
            const perFabricLimit = Math.floor(this.state.maxMembershipCount / 2);
            if (fabricMemberships.length >= perFabricLimit) {
                throw new StatusResponseError("Per-fabric membership limit reached", StatusCode.ResourceExhausted);
            }
            if (membership.length >= this.state.maxMembershipCount) {
                throw new StatusResponseError("Total membership limit reached", StatusCode.ResourceExhausted);
            }

            // Check MaxMcastAddrCount for new multicast address allocation
            if (policy === Groupcast.MulticastAddrPolicy.PerGroup) {
                const currentUsed = this.#computeUsedMcastAddrCount(membership);
                if (currentUsed >= this.state.maxMcastAddrCount) {
                    throw new StatusResponseError("MaxMcastAddrCount limit reached", StatusCode.ResourceExhausted);
                }
            } else if (policy === Groupcast.MulticastAddrPolicy.IanaAddr) {
                // IanaAddr pool counts as 1 address; only check if pool not yet allocated
                const hasIanaAddr = membership.some(m => m.mcastAddrPolicy === Groupcast.MulticastAddrPolicy.IanaAddr);
                if (!hasIanaAddr) {
                    const currentUsed = this.#computeUsedMcastAddrCount(membership);
                    if (currentUsed >= this.state.maxMcastAddrCount) {
                        throw new StatusResponseError("MaxMcastAddrCount limit reached", StatusCode.ResourceExhausted);
                    }
                }
            }

            const lnFields = this.features.listener ? { endpoints, hasAuxiliaryAcl: useAuxiliaryAcl ?? false } : {};
            membership.push({
                groupId,
                ...lnFields,
                keySetId,
                mcastAddrPolicy: policy,
                fabricIndex,
            });
        }

        this.state.membership = membership;
        this.#updateUsedMcastAddrCount();
        this.#syncFabricGroups(this.env.get(FabricManager).for(fabricIndex));
        this.#emitAuxAcl();

        // Mark fabric as having adopted Groupcast (makes GKM GroupKeyMap read-only)
        gkm.setGroupcastAdopted(fabricIndex, true);
    }

    override leaveGroup(request: Groupcast.LeaveGroupRequest): Groupcast.LeaveGroupResponse {
        assertRemoteActor(this.context);
        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const { groupId, endpoints: requestedEndpoints } = request;

        // GroupID 0 = wildcard: leave ALL groups for this fabric
        if (groupId === GroupId.NO_GROUP_ID) {
            const fabricMemberships = this.state.membership.filter(m => m.fabricIndex === fabricIndex);
            if (fabricMemberships.length === 0) {
                throw new StatusResponseError("No groups to leave", StatusCode.NotFound);
            }
            this.state.membership = this.state.membership.filter(m => m.fabricIndex !== fabricIndex);
            this.#updateUsedMcastAddrCount();
            this.#syncFabricGroups(this.env.get(FabricManager).for(fabricIndex));
            this.#emitAuxAcl();
            return { groupId: GroupId.NO_GROUP_ID, endpoints: [] };
        }

        const membership = deepCopy(this.state.membership);
        const entryIdx = membership.findIndex(m => m.groupId === groupId && m.fabricIndex === fabricIndex);

        if (entryIdx < 0) {
            throw new StatusResponseError(`Group ${groupId} not found`, StatusCode.NotFound);
        }

        const entry = membership[entryIdx];
        let removedEndpoints: EndpointNumber[];

        if (!requestedEndpoints || requestedEndpoints.length === 0) {
            // No specific endpoints specified → remove entire entry
            removedEndpoints = entry.endpoints ?? [];
            membership.splice(entryIdx, 1);
        } else {
            const currentEndpoints = entry.endpoints ?? [];
            removedEndpoints = requestedEndpoints.filter(ep => currentEndpoints.includes(ep));
            const remainingEndpoints = currentEndpoints.filter(ep => !requestedEndpoints.includes(ep));

            if (remainingEndpoints.length === 0) {
                if (this.features.sender) {
                    // SD feature enabled: keep entry as sender-only (omit endpoints when LN absent)
                    const { endpoints: _omit, ...entryWithoutEndpoints } = entry;
                    membership[entryIdx] = this.features.listener ? { ...entry, endpoints: [] } : entryWithoutEndpoints;
                } else {
                    // LN-only: remove the entry entirely
                    membership.splice(entryIdx, 1);
                }
            } else {
                membership[entryIdx] = { ...entry, endpoints: remainingEndpoints };
            }
        }

        this.state.membership = membership;
        this.#updateUsedMcastAddrCount();
        this.#syncFabricGroups(this.env.get(FabricManager).for(fabricIndex));
        this.#emitAuxAcl();

        return { groupId, endpoints: removedEndpoints };
    }

    override async updateGroupKey(request: Groupcast.UpdateGroupKeyRequest) {
        assertRemoteActor(this.context);
        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const { groupId, keySetId, key } = request;

        const membership = deepCopy(this.state.membership);
        const entryIdx = membership.findIndex(m => m.groupId === groupId && m.fabricIndex === fabricIndex);

        if (entryIdx < 0) {
            throw new StatusResponseError(`Group ${groupId} not found`, StatusCode.NotFound);
        }

        await this.#applyKeySet(fabricIndex, keySetId, key);

        membership[entryIdx] = { ...membership[entryIdx], keySetId };
        this.state.membership = membership;
        this.#syncFabricGroups(this.env.get(FabricManager).for(fabricIndex));
    }

    configureAuxiliaryAcl(request: Groupcast.ConfigureAuxiliaryAclRequest) {
        assertRemoteActor(this.context);
        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const { groupId, useAuxiliaryAcl } = request;

        const membership = deepCopy(this.state.membership);
        const entryIdx = membership.findIndex(m => m.groupId === groupId && m.fabricIndex === fabricIndex);

        if (entryIdx < 0) {
            throw new StatusResponseError(`Group ${groupId} not found`, StatusCode.NotFound);
        }

        membership[entryIdx] = { ...membership[entryIdx], hasAuxiliaryAcl: useAuxiliaryAcl };
        this.state.membership = membership;
        this.#emitAuxAcl();
    }

    override groupcastTesting(request: Groupcast.GroupcastTestingRequest) {
        assertRemoteActor(this.context);
        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const { testOperation, durationSeconds } = request;

        // Cancel any running auto-disable timer
        if (this.#testingTimer) {
            this.#testingTimer.stop();
            this.#testingTimer = undefined;
        }

        if (testOperation === Groupcast.GroupcastTesting.DisableTesting) {
            this.state.fabricUnderTest = FabricIndex.NO_FABRIC;
            return;
        }

        // Enable testing: set FabricUnderTest to the current fabric index
        this.state.fabricUnderTest = fabricIndex;

        // If durationSeconds is provided, auto-disable after that duration
        if (durationSeconds !== undefined && durationSeconds > 0) {
            this.#testingTimer = Time.getTimer(
                `groupcast-testing-${fabricIndex}`,
                Seconds(durationSeconds),
                this.callback(this.#testingTimerExpired),
            );
            this.#testingTimer.start();
        }
    }

    #testingTimerExpired() {
        this.#testingTimer = undefined;
        this.state.fabricUnderTest = FabricIndex.NO_FABRIC;
    }

    /** Sync the FabricGroups instance for a fabric from the current Membership state. */
    #handleFabricAdded(fabric: Fabric) {
        this.#syncFabricGroups(fabric);
    }

    #handleFabricDeleted(fabric: Fabric) {
        this.#cleanupFabric(fabric.fabricIndex);
    }

    #syncFabricGroups(fabric: Fabric) {
        const fabricIndex = fabric.fabricIndex;
        const fabricMemberships = this.state.membership.filter(m => m.fabricIndex === fabricIndex);

        // Rebuild group→keySet map
        const groupKeyIdMap = new Map<GroupId, number>();
        for (const m of fabricMemberships) {
            groupKeyIdMap.set(m.groupId, m.keySetId);
        }
        fabric.groups.groupKeyIdMap = groupKeyIdMap;

        // Set per-group multicast address policies
        for (const m of fabricMemberships) {
            const policy = m.mcastAddrPolicy === Groupcast.MulticastAddrPolicy.PerGroup ? "perGroupId" : "ianaAddr";
            fabric.groups.setGroupMulticastPolicy(m.groupId, policy);
        }
    }

    /**
     * Validate and apply a key set for a group operation.
     * If `key` is provided, validates and creates a new key set in GKM.
     * Otherwise, validates that the key set already exists.
     */
    async #applyKeySet(fabricIndex: FabricIndex, keySetId: number, key: Bytes | undefined) {
        const gkm = this.agent.get(GroupKeyManagementServer);
        if (key !== undefined) {
            if (key.byteLength !== 16) {
                throw new StatusResponseError("Key must be exactly 16 bytes", StatusCode.ConstraintError);
            }
            if (gkm.validateKeySetId(fabricIndex, keySetId)) {
                throw new StatusResponseError(`KeySet ${keySetId} already exists for fabric`, StatusCode.AlreadyExists);
            }
            await gkm.createKeySetForGroupcast(this.env.get(FabricManager).for(fabricIndex), keySetId, Bytes.of(key));
        } else {
            if (!gkm.validateKeySetId(fabricIndex, keySetId)) {
                throw new StatusResponseError(`KeySet ${keySetId} not found for fabric`, StatusCode.NotFound);
            }
        }
    }

    /** Recompute auxiliary ACL entries and emit them via the observable so AccessControlServer updates. */
    #emitAuxAcl() {
        if (!this.endpoint.behaviors.has(AccessControlServer)) return;
        const entries: AccessControlTypes.AccessControlEntry[] = this.state.membership
            .filter(m => m.hasAuxiliaryAcl)
            .map(m => ({
                privilege: AccessControlTypes.AccessControlEntryPrivilege.View,
                authMode: AccessControlTypes.AccessControlEntryAuthMode.Group,
                subjects: [NodeId(BigInt(m.groupId))],
                targets:
                    m.endpoints?.map(ep => ({
                        cluster: null,
                        endpoint: ep,
                        deviceType: null,
                    })) ?? null,
                auxiliaryType: AccessControlTypes.AccessControlAuxiliaryType.Groupcast,
                fabricIndex: m.fabricIndex,
            }));
        this.internal.auxAcl.emit(entries);
    }

    /**
     * Compute UsedMcastAddrCount from a membership array:
     * - Each PerGroup group contributes 1 unique address
     * - All IanaAddr groups together share 1 address
     */
    #computeUsedMcastAddrCount(membership: Groupcast.Membership[]): number {
        const perGroupCount = membership.filter(
            m => m.mcastAddrPolicy === Groupcast.MulticastAddrPolicy.PerGroup,
        ).length;
        const hasIanaAddr = membership.some(m => m.mcastAddrPolicy === Groupcast.MulticastAddrPolicy.IanaAddr);
        return perGroupCount + (hasIanaAddr ? 1 : 0);
    }

    /** Recompute and update the UsedMcastAddrCount attribute. */
    #updateUsedMcastAddrCount() {
        this.state.usedMcastAddrCount = this.#computeUsedMcastAddrCount(this.state.membership);
    }

    /** Remove all state for a departed fabric. */
    #cleanupFabric(fabricIndex: FabricIndex) {
        this.state.membership = this.state.membership.filter(m => m.fabricIndex !== fabricIndex);
        this.#updateUsedMcastAddrCount();
        this.#emitAuxAcl();
    }

    /**
     * Migrate legacy group data from the GKM groupTable into Groupcast Membership entries.
     * Only migrates fabrics that have existing GKM groups but no Membership entries yet.
     * Legacy groups are assigned PerGroup multicast policy for backwards compatibility.
     */
    async #migrate() {
        const fabrics = this.env.get(FabricManager);
        const gkmState = this.endpoint.stateOf(GroupKeyManagementServer);
        const gkm = this.agent.get(GroupKeyManagementServer);
        let migrated = false;

        for (const fabric of fabrics) {
            const fi = fabric.fabricIndex;
            const hasMembership = this.state.membership.some(m => m.fabricIndex === fi);
            if (hasMembership) continue; // already has Groupcast membership

            const fabricGroups = gkmState.groupTable.filter(g => g.fabricIndex === fi);
            if (fabricGroups.length === 0) continue; // no legacy groups

            logger.info(`Migrating ${fabricGroups.length} legacy group(s) for fabric ${fi} to Groupcast`);

            const newEntries: Groupcast.Membership[] = fabricGroups.map(group => {
                const keyMapping = gkmState.groupKeyMap.find(m => m.fabricIndex === fi && m.groupId === group.groupId);
                // Use PerGroup policy for legacy compat only if PGA feature is enabled
                const mcastAddrPolicy = this.features.perGroup
                    ? Groupcast.MulticastAddrPolicy.PerGroup
                    : Groupcast.MulticastAddrPolicy.IanaAddr;
                const lnFields = this.features.listener
                    ? {
                          endpoints: group.endpoints.filter(ep => ep !== EndpointNumber(0)),
                          hasAuxiliaryAcl: false,
                      }
                    : {};
                return {
                    groupId: group.groupId,
                    ...lnFields,
                    keySetId: keyMapping?.groupKeySetId ?? 0,
                    mcastAddrPolicy,
                    fabricIndex: fi,
                };
            });

            this.state.membership = [...this.state.membership, ...newEntries];
            this.#syncFabricGroups(fabric);
            gkm.setGroupcastAdopted(fi, true);
            migrated = true;
        }

        if (migrated) {
            this.#updateUsedMcastAddrCount();
            logger.info("Groupcast migration complete");
        }
    }

    override async [Symbol.asyncDispose]() {
        this.#testingTimer?.stop();
        this.#testingTimer = undefined;
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace GroupcastServer {
    /** Non-persistent internal state for GroupcastServer. */
    export class Internal {
        /**
         * Observable that holds all auxiliary ACL entries supplied by this cluster.
         * AccessControlServer subscribes to this and rebuilds its ACL cache whenever it emits.
         */
        auxAcl = ObservableValue<[AccessControlTypes.AccessControlEntry[]]>([]);
    }

    /** Default state overrides for GroupcastServer. */
    export class State extends GroupcastBehavior.State {
        /** Implementation-defined maximum membership count (min 10 per spec). */
        override maxMembershipCount = 254;
        /** Implementation-defined maximum multicast address count (min 1 per spec). */
        override maxMcastAddrCount = 254;
    }
}
