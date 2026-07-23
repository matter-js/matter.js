/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { AccessControlServer } from "#behaviors/access-control";
import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { NodeLifecycle } from "#node/NodeLifecycle.js";
import {
    Bytes,
    deepCopy,
    ImplementationError,
    ipv6ToBytes,
    isIPv6,
    Logger,
    ObservableValue,
    Seconds,
    Time,
    Timer,
} from "@matter/general";
import { AccessLevel, DataModelPath, DatatypeElement, FieldElement } from "@matter/model";
import {
    AccessControl,
    assertRemoteActor,
    Fabric,
    FabricManager,
    GroupMessageEventInfo,
    IANA_GROUPCAST_MULTICAST_ADDRESS,
    SessionManager,
} from "@matter/protocol";
import { EndpointNumber, FabricIndex, GroupId, NodeId, Status, StatusResponseError } from "@matter/types";
import { AccessControl as AccessControlTypes } from "@matter/types/clusters/access-control";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { Groupcast } from "@matter/types/clusters/groupcast";
import { GroupcastBehavior } from "./GroupcastBehavior.js";

const logger = Logger.get("GroupcastServer");

/** Membership.KeySetId sentinel indicating the group has no usable GroupKeyMap link in GKM. */
const UNMAPPED_KEYSET_ID = 0xffff;

/**
 * Converts an IP address string to the 16-byte ipv6adr representation of the GroupcastTesting event, stripping any
 * IPv6 zone suffix ("%eth0").  Returns undefined for non-IPv6 input (e.g. a group message received via IPv4).
 */
function toIpv6EventAddress(ip: string | undefined) {
    if (ip === undefined) {
        return undefined;
    }
    const zoneIndex = ip.indexOf("%");
    const address = zoneIndex === -1 ? ip : ip.substring(0, zoneIndex);
    return isIPv6(address) ? ipv6ToBytes(address) : undefined;
}

const GroupcastBase = GroupcastBehavior;

// GroupProperties persists per-group policy metadata (excluding Membership's KeySetId/Endpoints fields) so a later
// derivation step can rebuild Membership from this state alone. Has no numeric attribute id, so it stays
// server-only and is never enumerated or wire-encoded as a cluster attribute.
const groupPropertiesStructFS = DatatypeElement(
    { name: "GroupPropertiesStruct", type: "struct" },
    FieldElement({ name: "GroupId", id: 0x0, type: "group-id", access: "F", conformance: "M", constraint: "min 1" }),
    FieldElement({
        name: "McastAddrPolicy",
        id: 0x1,
        type: "MulticastAddrPolicyEnum",
        access: "F",
        conformance: "M",
        default: 0,
    }),
    FieldElement({ name: "HasAuxiliaryAcl", id: 0x2, type: "bool", access: "F", conformance: "M" }),
    FieldElement({ name: "FabricIndex", id: 0xfe, type: "FabricIndex", conformance: "M" }),
);
const schema = GroupcastBase.schema.extend(
    {},
    groupPropertiesStructFS,
    FieldElement(
        {
            name: "groupProperties",
            type: "list",
            quality: "N",
            access: "RW F",
            conformance: "M",
        },
        FieldElement({ name: "entry", type: "GroupPropertiesStruct" }),
    ),
);

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
 * - Migrates legacy group data from the Groups cluster on startup.
 */
export class GroupcastServer extends GroupcastBase {
    declare internal: GroupcastServer.Internal;
    declare readonly state: GroupcastServer.State;
    static override readonly schema = schema;

    /** Timer for GroupcastTesting auto-disable. */
    #testingTimer?: Timer;

    override initialize() {
        const lifecycle = this.endpoint.lifecycle as NodeLifecycle;
        this.reactTo(lifecycle.online, this.#online);
    }

    async #online() {
        const acl = this.agent.get(AccessControlServer);

        // Spec core§11.27.7.1.5: a Listener generates AuxiliaryACL entries in the AccessControl cluster, which
        // requires the Auxiliary feature.  Without it the synthetic entries would grant access that the node does not
        // advertise and clients cannot inspect.
        if (this.features.listener && !acl.features.auxiliary) {
            throw new ImplementationError(
                'The Groupcast Listener feature requires the AccessControl Auxiliary feature. Use AccessControlServer.with("Extension", "Auxiliary").',
            );
        }

        // Register the aux ACL observable with AccessControlServer so it can subscribe for updates
        acl.registerAuxAclProvider(this.internal.auxAcl);

        const fabrics = this.env.get(FabricManager);

        // Sync FabricGroups for all existing fabrics
        for (const fabric of fabrics) {
            this.#syncFabricGroups(fabric);
        }

        // Migrate legacy Groups cluster data to Groupcast Membership
        await this.#migrate();

        // Reconcile membership KeySetIds with GroupKeyMap links that may have changed via GKM
        this.#reconcileUnmappedKeys();

        // Update the derived state once after all sync/migration is done
        this.#updateUsedMcastAddrCount();
        this.#emitAuxAcl();

        // Keep in sync as fabrics are added, replaced or removed.  A replaced fabric gets a fresh Groups instance,
        // so the multicast address policies and key mappings must be rebuilt from the persisted membership.
        this.reactTo(fabrics.events.added, this.#handleFabricAdded);
        this.reactTo(fabrics.events.replaced, this.#handleFabricAdded);
        this.reactTo(fabrics.events.deleted, this.#handleFabricDeleted);

        // Membership.KeySetId mirrors the GroupKeyMap link, so any map change re-derives it.  The reactors run
        // offline because they update the read-only Membership attribute, which the triggering remote actor (a GKM
        // attribute write) is not authorized to touch.
        const gkmEvents = this.endpoint.eventsOf(GroupKeyManagementServer);
        this.reactTo(gkmEvents.groupKeyMap$Changed, this.#reconcileUnmappedKeys, { offline: true });

        // Per core§11.27.10 group removal through any means (e.g. the legacy Groups cluster commands, which operate
        // on the GKM group table) must update Membership and the auxiliary ACL entries derived from it
        this.reactTo(gkmEvents.groupTable$Changed, this.#reconcileMembershipEndpoints, { offline: true });

        // React to fabricUnderTest changes to dynamically subscribe/unsubscribe from group message events.
        // While no fabric is under test, SessionManager.groupMessage emits are a no-op (no listeners).
        this.reactTo(this.events.fabricUnderTest$Changed, this.#handleFabricUnderTestChanged);
        if (this.state.fabricUnderTest !== FabricIndex.NO_FABRIC) {
            this.#attachGroupMessageListener();
        }
    }

    /**
     * Check whether the current session has Admin privileges for this cluster/endpoint.
     * Key and useAuxiliaryACL fields in Manage-access commands require Admin
     * privilege to prevent privilege escalation.
     */
    #requireAdmin() {
        // Called only from handlers that already asserted remote actor, safe to narrow
        const session = this.context as AccessControl.RemoteActorSession;
        const location: AccessControl.Location = {
            path: DataModelPath.none,
            endpoint: this.endpoint.number,
            cluster: GroupcastBehavior.cluster.id,
            owningFabric: session.fabric,
        };
        if (session.authorityAt(AccessLevel.Administer, location) !== AccessControl.Authority.Granted) {
            throw new StatusResponseError(
                "Admin privilege required for key or ACL operations",
                Status.UnsupportedAccess,
            );
        }
    }

    override async joinGroup(request: Groupcast.JoinGroupRequest) {
        assertRemoteActor(this.context);
        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const { groupId, endpoints, keySetId, key, useAuxiliaryAcl, replaceEndpoints, mcastAddrPolicy } = request;

        // Validate groupId range
        if (groupId < 1 || groupId > 0xfff7) {
            throw new StatusResponseError("Invalid group ID", Status.ConstraintError);
        }

        // Privilege escalation prevention: key and useAuxiliaryACL require Admin
        if (key !== undefined || useAuxiliaryAcl !== undefined) {
            this.#requireAdmin();
        }

        // Validate endpoints: ep 0 (root) and ep > 0xFFFE are invalid per spec
        for (const ep of endpoints) {
            if (ep === 0 || ep > 0xfffe) {
                throw new StatusResponseError(`Endpoint ${ep} is invalid`, Status.UnsupportedEndpoint);
            }
        }

        // If LN-only (no SD feature), an empty endpoint list is not allowed
        if (!this.features.sender && endpoints.length === 0) {
            throw new StatusResponseError("Empty endpoint list requires Sender feature", Status.ConstraintError);
        }

        // Validate multicast address policy: PerGroup requires PerGroupAddr feature
        const policy = mcastAddrPolicy ?? Groupcast.MulticastAddrPolicy.IanaAddr;
        if (policy === Groupcast.MulticastAddrPolicy.PerGroup && !this.features.perGroup) {
            throw new StatusResponseError(
                "PerGroup multicast policy requires PerGroupAddr feature",
                Status.ConstraintError,
            );
        }

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
                throw new StatusResponseError("Per-fabric membership limit reached", Status.ResourceExhausted);
            }
            if (membership.length >= this.state.maxMembershipCount) {
                throw new StatusResponseError("Total membership limit reached", Status.ResourceExhausted);
            }

            // Check MaxMcastAddrCount for new multicast address allocation
            if (policy === Groupcast.MulticastAddrPolicy.PerGroup) {
                const currentUsed = this.#computeUsedMcastAddrCount(membership);
                if (currentUsed >= this.state.maxMcastAddrCount) {
                    throw new StatusResponseError("MaxMcastAddrCount limit reached", Status.ResourceExhausted);
                }
            } else if (policy === Groupcast.MulticastAddrPolicy.IanaAddr) {
                // IanaAddr pool counts as 1 address; only check if pool not yet allocated
                const hasIanaAddr = membership.some(m => m.mcastAddrPolicy === Groupcast.MulticastAddrPolicy.IanaAddr);
                if (!hasIanaAddr) {
                    const currentUsed = this.#computeUsedMcastAddrCount(membership);
                    if (currentUsed >= this.state.maxMcastAddrCount) {
                        throw new StatusResponseError("MaxMcastAddrCount limit reached", Status.ResourceExhausted);
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
        this.#upsertGroupProperties(fabricIndex, groupId, {
            mcastAddrPolicy: policy,
            ...(useAuxiliaryAcl !== undefined ? { hasAuxiliaryAcl: useAuxiliaryAcl } : {}),
        });

        /* The GroupKeyManagement GroupcastAdoption attribute is not supported by the default server:
        const gkm = this.agent.get(GroupKeyManagementServer);
        gkm.setGroupcastAdopted(fabricIndex, true);
        */
    }

    override leaveGroup(request: Groupcast.LeaveGroupRequest): Groupcast.LeaveGroupResponse {
        assertRemoteActor(this.context);
        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const { groupId, endpoints: requestedEndpoints } = request;

        // GroupID 0 = wildcard: leave ALL groups for this fabric
        if (groupId === GroupId.NO_GROUP_ID) {
            // Extract the ids before replacing the membership: the filtered entries are managed references that
            // become invalid once removed from the state container
            const removedGroupIds = this.state.membership
                .filter(m => m.fabricIndex === fabricIndex)
                .map(m => m.groupId);
            if (removedGroupIds.length === 0) {
                throw new StatusResponseError("No groups to leave", Status.NotFound);
            }
            this.state.membership = this.state.membership.filter(m => m.fabricIndex !== fabricIndex);
            this.#updateUsedMcastAddrCount();
            this.#syncFabricGroups(this.env.get(FabricManager).for(fabricIndex), removedGroupIds);
            this.#emitAuxAcl();
            for (const removedGroupId of removedGroupIds) {
                this.#removeGroupProperties(fabricIndex, removedGroupId);
            }
            return { groupId: GroupId.NO_GROUP_ID, endpoints: [] };
        }

        const membership = deepCopy(this.state.membership);
        const entryIdx = membership.findIndex(m => m.groupId === groupId && m.fabricIndex === fabricIndex);

        if (entryIdx < 0) {
            throw new StatusResponseError(`Group ${groupId} not found`, Status.NotFound);
        }

        const entry = membership[entryIdx];
        let removedEndpoints: EndpointNumber[];
        let entryRemoved = false;

        if (!requestedEndpoints || requestedEndpoints.length === 0) {
            // No specific endpoints specified → remove entire entry
            removedEndpoints = entry.endpoints ?? [];
            membership.splice(entryIdx, 1);
            entryRemoved = true;
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
                    entryRemoved = true;
                }
            } else {
                membership[entryIdx] = { ...entry, endpoints: remainingEndpoints };
            }
        }

        this.state.membership = membership;
        this.#updateUsedMcastAddrCount();
        this.#syncFabricGroups(this.env.get(FabricManager).for(fabricIndex), entryRemoved ? [groupId] : undefined);
        this.#emitAuxAcl();
        if (entryRemoved) {
            this.#removeGroupProperties(fabricIndex, groupId);
        }

        return { groupId, endpoints: removedEndpoints };
    }

    override async updateGroupKey(request: Groupcast.UpdateGroupKeyRequest) {
        assertRemoteActor(this.context);
        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const { groupId, keySetId, key } = request;

        // Privilege escalation prevention: key requires Admin
        if (key !== undefined) {
            this.#requireAdmin();
        }

        const membership = deepCopy(this.state.membership);
        const entryIdx = membership.findIndex(m => m.groupId === groupId && m.fabricIndex === fabricIndex);

        if (entryIdx < 0) {
            throw new StatusResponseError(`Group ${groupId} not found`, Status.NotFound);
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
            throw new StatusResponseError(`Group ${groupId} not found`, Status.NotFound);
        }

        membership[entryIdx] = { ...membership[entryIdx], hasAuxiliaryAcl: useAuxiliaryAcl };
        this.state.membership = membership;
        this.#emitAuxAcl();
        this.#upsertGroupProperties(fabricIndex, groupId, { hasAuxiliaryAcl: useAuxiliaryAcl });
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

    #handleFabricUnderTestChanged(value: FabricIndex) {
        if (value !== FabricIndex.NO_FABRIC) {
            this.#attachGroupMessageListener();
        } else {
            this.#detachGroupMessageListener();
        }
    }

    #attachGroupMessageListener() {
        if (this.internal.groupMessageHandler !== undefined) {
            return;
        }
        const sessions = this.env.get(SessionManager);
        // SessionManager.onGroupMessage fires after the dispatching action's context has exited, so
        // wrap the handler with this.callback to acquire a fresh context for state/event access.
        const handler = this.callback(this.#onGroupMessage);
        sessions.onGroupMessage.on(handler);
        this.internal.groupMessageHandler = handler;
    }

    #detachGroupMessageListener() {
        if (this.internal.groupMessageHandler === undefined) {
            return;
        }
        const sessions = this.env.get(SessionManager);
        sessions.onGroupMessage.off(this.internal.groupMessageHandler);
        this.internal.groupMessageHandler = undefined;
    }

    #onGroupMessage(info: GroupMessageEventInfo) {
        const fabricUnderTest = this.state.fabricUnderTest;
        if (fabricUnderTest === FabricIndex.NO_FABRIC) {
            return;
        }

        // Authenticated messages report only for the fabric under test.  Decode failures are unauthenticated
        // (no fabric) and are reported on the fabric under test per the GroupcastTesting spec.
        if (info.fabric !== undefined && info.fabric.fabricIndex !== fabricUnderTest) {
            return;
        }

        // The datagram destination is not available from the socket, so derive the multicast group address the
        // message was received on from the group id (the header group id for unauthenticated failures).  An unknown
        // group's datagram can only have arrived via the shared IANA address, since per-group addresses are joined
        // per known group.
        let destIp = info.destIp;
        const groupIdForAddress = info.groupId ?? info.headerGroupId;
        if (destIp === undefined && groupIdForAddress !== undefined) {
            const known = this.state.membership.some(
                m => m.fabricIndex === fabricUnderTest && m.groupId === groupIdForAddress,
            );
            const fabrics = this.env.get(FabricManager);
            if (known && fabrics.has(fabricUnderTest)) {
                destIp = fabrics.for(fabricUnderTest).groups.multicastAddressFor(groupIdForAddress);
            } else {
                destIp = IANA_GROUPCAST_MULTICAST_ADDRESS;
            }
        }
        // Without any group knowledge (privacy-obfuscated header and no authenticating key set) the IANA address
        // remains the only plausible arrival address
        destIp ??= IANA_GROUPCAST_MULTICAST_ADDRESS;

        this.events.groupcastTesting?.emit(
            {
                sourceIpAddress: toIpv6EventAddress(info.sourceIp),
                destinationIpAddress: toIpv6EventAddress(destIp),
                groupId: info.groupId,
                endpointId: info.endpointId,
                clusterId: info.clusterId,
                elementId: info.elementId,
                accessAllowed: info.accessAllowed,
                groupcastTestResult: info.result,
                fabricIndex: fabricUnderTest,
            },
            this.context,
        );
    }

    /** Sync the FabricGroups instance for a fabric from the current Membership state. */
    #handleFabricAdded(fabric: Fabric) {
        this.#syncFabricGroups(fabric);
    }

    #handleFabricDeleted(fabric: Fabric) {
        this.#cleanupFabric(fabric.fabricIndex);
    }

    /**
     * Sync the operational and GKM views of this fabric's groups from the Membership state.  Only Groupcast-owned
     * groups (current membership plus explicitly removed ones) are touched; groups configured through the legacy
     * Groups/GKM path are preserved.
     */
    #syncFabricGroups(fabric: Fabric, removedGroupIds?: Iterable<GroupId>) {
        const fabricIndex = fabric.fabricIndex;
        const fabricMemberships = this.state.membership.filter(m => m.fabricIndex === fabricIndex);

        // Set per-group multicast address policies BEFORE updating the endpoint map. The latter triggers
        // ServerGroupNetworking to bind the multicast address via multicastAddressFor, which reads the
        // policy map - so the policy must be in place first or it falls back to PerGroupId-derived.
        for (const m of fabricMemberships) {
            const policy = m.mcastAddrPolicy === Groupcast.MulticastAddrPolicy.PerGroup ? "perGroupId" : "ianaAddr";
            fabric.groups.setGroupMulticastPolicy(m.groupId, policy);
        }

        const owned = new Set(fabricMemberships.map(m => m.groupId));
        const removed = new Set<GroupId>();
        for (const groupId of removedGroupIds ?? []) {
            if (!owned.has(groupId)) {
                removed.add(groupId);
                fabric.groups.removeGroupMulticastPolicy(groupId);
            }
        }

        // Merge group→keySet map: entries of Groupcast-owned groups follow the membership, entries of other groups
        // (e.g. legacy Groups cluster configuration) are preserved.  Unmapped groups are absent so key lookup fails
        // cleanly rather than pointing at the nonexistent sentinel key set.
        const groupKeyIdMap = new Map<GroupId, number>(fabric.groups.groupKeyIdMap);
        for (const groupId of removed) {
            groupKeyIdMap.delete(groupId);
        }
        for (const m of fabricMemberships) {
            if (m.keySetId !== UNMAPPED_KEYSET_ID) {
                groupKeyIdMap.set(m.groupId, m.keySetId);
            } else {
                groupKeyIdMap.delete(m.groupId);
            }
        }
        fabric.groups.groupKeyIdMap = groupKeyIdMap;

        // Mirror Membership mappings into GKM GroupKeyMap so the attribute read reflects them.
        // Data dependency: Groupcast owns its groups' group→keySet relationship; GroupKeyMap must reflect it.
        // GKM's per-fabric cap (maxGroupsPerFabric) and Groupcast's per-fabric cap (floor(maxMembershipCount/2))
        // must stay aligned so the mirror never exceeds the GKM validator.
        const gkm = this.agent.get(GroupKeyManagementServer);
        const keptMap = gkm.state.groupKeyMap.filter(
            e => e.fabricIndex !== fabricIndex || (!owned.has(e.groupId) && !removed.has(e.groupId)),
        );
        const mappings = fabricMemberships
            .filter(m => m.keySetId !== UNMAPPED_KEYSET_ID)
            .map(m => ({ groupId: m.groupId, groupKeySetId: m.keySetId, fabricIndex }));
        gkm.state.groupKeyMap = [...keptMap, ...mappings];

        // Mirror Membership endpoints to GKM GroupTable (spec attribute) and FabricGroups.endpoints
        // (runtime dispatch lookup used by InteractionServer for wildcard group commands).  Group names only exist
        // in the legacy group table, so they are preserved from the existing entries.
        const existingNames = new Map(
            gkm.state.groupTable.filter(e => e.fabricIndex === fabricIndex).map(e => [e.groupId, e.groupName] as const),
        );
        const keptTable = gkm.state.groupTable.filter(
            e => e.fabricIndex !== fabricIndex || (!owned.has(e.groupId) && !removed.has(e.groupId)),
        );
        const tableEntries = fabricMemberships
            .filter(m => m.endpoints !== undefined && m.endpoints.length > 0)
            .map(m => ({
                groupId: m.groupId,
                endpoints: [...(m.endpoints ?? [])],
                groupName: existingNames.get(m.groupId) ?? "",
                fabricIndex,
            }));
        gkm.state.groupTable = [...keptTable, ...tableEntries];

        for (const m of fabricMemberships) {
            const eps = m.endpoints ?? [];
            if (eps.length > 0) {
                fabric.groups.endpoints.set(m.groupId, [...eps]);
            } else {
                fabric.groups.endpoints.delete(m.groupId);
            }
        }
        for (const groupId of removed) {
            fabric.groups.endpoints.delete(groupId);
        }
    }

    /**
     * Keep Membership.KeySetId in sync with the GKM GroupKeyMap link.  An entry whose group has no GroupKeyMap mapping
     * (or whose mapped key set no longer exists) reports UNMAPPED_KEYSET_ID; when the mapping (re)appears the KeySetId
     * is restored from it.  Runs at startup and whenever GroupKeyMap changes.
     */
    #reconcileUnmappedKeys() {
        const gkmState = this.endpoint.stateOf(GroupKeyManagementServer);
        const membership = this.state.membership;
        let dirty = false;

        for (const m of membership) {
            const mapping = gkmState.groupKeyMap.find(e => e.fabricIndex === m.fabricIndex && e.groupId === m.groupId);
            // Key set 0 is the fabric IPK, which always exists but is never stored in groupKeySets
            const keySetId =
                mapping !== undefined &&
                (mapping.groupKeySetId === 0 ||
                    gkmState.groupKeySets.some(
                        ks => ks.fabricIndex === m.fabricIndex && ks.groupKeySetId === mapping.groupKeySetId,
                    ))
                    ? mapping.groupKeySetId
                    : UNMAPPED_KEYSET_ID;
            if (m.keySetId !== keySetId) {
                m.keySetId = keySetId;
                dirty = true;
            }
        }

        if (dirty) {
            this.state.membership = [...membership];
        }
    }

    /**
     * Shrink Membership when endpoints or whole groups are removed through the GKM group table (e.g. by the legacy
     * Groups cluster commands).  Per core§11.27.10 such removals must update Membership and its derived auxiliary
     * ACL entries.  Only removals are mirrored; matching {@link leaveGroup}, a listener entry losing all endpoints
     * stays as sender-only when the Sender feature is enabled and disappears otherwise.
     */
    #reconcileMembershipEndpoints(
        groupTable: GroupKeyManagement.GroupInfoMap[],
        _oldGroupTable?: GroupKeyManagement.GroupInfoMap[],
        context?: ActionContext,
    ) {
        const membership = this.state.membership;
        const next = new Array<Groupcast.Membership>();
        const affectedFabrics = new Set<FabricIndex>();
        const removedGroups = new Map<FabricIndex, GroupId[]>();

        for (const m of membership) {
            if (m.endpoints === undefined || m.endpoints.length === 0) {
                // Sender-only entries carry no endpoints to remove
                next.push(m);
                continue;
            }
            const tableEndpoints =
                groupTable.find(e => e.fabricIndex === m.fabricIndex && e.groupId === m.groupId)?.endpoints ?? [];
            const endpoints = m.endpoints.filter(ep => tableEndpoints.includes(ep));
            if (endpoints.length === m.endpoints.length) {
                next.push(m);
                continue;
            }
            affectedFabrics.add(m.fabricIndex);
            if (endpoints.length > 0) {
                next.push({ ...m, endpoints });
            } else if (this.features.sender) {
                next.push({ ...m, endpoints: [] });
            } else {
                let removed = removedGroups.get(m.fabricIndex);
                if (removed === undefined) {
                    removed = [];
                    removedGroups.set(m.fabricIndex, removed);
                }
                removed.push(m.groupId);
            }
        }

        if (affectedFabrics.size === 0) {
            return;
        }

        this.state.membership = next;
        const fabrics = this.env.get(FabricManager);
        for (const fabricIndex of affectedFabrics) {
            if (fabrics.has(fabricIndex)) {
                this.#syncFabricGroups(fabrics.for(fabricIndex), removedGroups.get(fabricIndex));
            }
        }
        this.#updateUsedMcastAddrCount();
        this.#emitAuxAcl(context);
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
                throw new StatusResponseError("Key must be exactly 16 bytes", Status.ConstraintError);
            }
            if (gkm.validateKeySetId(fabricIndex, keySetId)) {
                throw new StatusResponseError(`KeySet ${keySetId} already exists for fabric`, Status.AlreadyExists);
            }
            await gkm.createKeySetForGroupcast(this.env.get(FabricManager).for(fabricIndex), keySetId, Bytes.of(key));
        } else {
            if (!gkm.validateKeySetId(fabricIndex, keySetId)) {
                throw new StatusResponseError(`KeySet ${keySetId} not found for fabric`, Status.NotFound);
            }
        }
    }

    /**
     * Recompute auxiliary ACL entries and emit them via the observable so AccessControlServer updates.  The context
     * identifies the administrating actor in the AuxiliaryAccessUpdated event; pass the triggering context when the
     * recomputation runs in an offline reactor.
     */
    #emitAuxAcl(context: ActionContext = this.context) {
        if (!this.endpoint.behaviors.has(AccessControlServer)) return;
        // Auxiliary entries grant Operate per listener endpoint (core§11.27.10); sender-only memberships get none
        const entries = new Array<AccessControlTypes.AccessControlEntry>();
        for (const m of this.state.membership) {
            const { endpoints } = m;
            if (!m.hasAuxiliaryAcl || endpoints === undefined || endpoints.length === 0) {
                continue;
            }
            entries.push({
                privilege: AccessControlTypes.AccessControlEntryPrivilege.Operate,
                authMode: AccessControlTypes.AccessControlEntryAuthMode.Group,
                subjects: [NodeId(BigInt(m.groupId))],
                targets: endpoints.map(ep => ({
                    cluster: null,
                    endpoint: ep,
                    deviceType: null,
                })),
                auxiliaryType: AccessControlTypes.AccessControlAuxiliaryType.Groupcast,
                fabricIndex: m.fabricIndex,
            });
        }

        this.internal.auxAcl.emit(entries, context);
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

    /** Insert or update a {@link GroupcastServer.GroupPropertiesEntry}, applying only the given fields. */
    #upsertGroupProperties(
        fabricIndex: FabricIndex,
        groupId: GroupId,
        changes: { mcastAddrPolicy?: Groupcast.MulticastAddrPolicy; hasAuxiliaryAcl?: boolean },
    ) {
        const props = deepCopy(this.state.groupProperties);
        const idx = props.findIndex(p => p.fabricIndex === fabricIndex && p.groupId === groupId);
        if (idx >= 0) {
            props[idx] = { ...props[idx], ...changes };
        } else {
            props.push({
                fabricIndex,
                groupId,
                mcastAddrPolicy: changes.mcastAddrPolicy ?? Groupcast.MulticastAddrPolicy.IanaAddr,
                hasAuxiliaryAcl: changes.hasAuxiliaryAcl ?? false,
            });
        }
        this.state.groupProperties = props;
    }

    #removeGroupProperties(fabricIndex: FabricIndex, groupId: GroupId) {
        this.state.groupProperties = this.state.groupProperties.filter(
            p => !(p.fabricIndex === fabricIndex && p.groupId === groupId),
        );
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
            /* The GroupKeyManagement GroupcastAdoption attribute is not supported by the default server:
            const gkm = this.agent.get(GroupKeyManagementServer);
            gkm.setGroupcastAdopted(fi, true);
            */
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
        this.#detachGroupMessageListener();
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
        auxAcl: AccessControlServer.AuxAclObservable = ObservableValue([]);

        /** Active subscription handler on SessionManager.groupMessage while fabricUnderTest is set. */
        groupMessageHandler?: (info: GroupMessageEventInfo) => void;
    }

    /** A single persisted {@link GroupcastServer.State.groupProperties} entry. */
    export type GroupPropertiesEntry = {
        fabricIndex: FabricIndex;
        groupId: GroupId;
        mcastAddrPolicy: Groupcast.MulticastAddrPolicy;
        hasAuxiliaryAcl: boolean;
    };

    /** Default state overrides for GroupcastServer. */
    export class State extends GroupcastBehavior.State {
        /**
         * Implementation-defined maximum membership count (min 10 per spec).
         * Set to 2 * GKM.maxGroupsPerFabric (44) so per-fabric quota floor(44/2)=22 aligns exactly
         * with GKM's per-fabric cap. Even number avoids spillover semantics.
         */
        override maxMembershipCount = 44;
        /** Implementation-defined maximum multicast address count (min 1 per spec). */
        override maxMcastAddrCount = 44;

        /** Persisted per-group policy metadata. Unused until a later task derives Membership from this state. */
        groupProperties: GroupPropertiesEntry[] = new Array<GroupPropertiesEntry>();
    }
}
