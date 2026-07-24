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
    SynchronousTransactionConflictError,
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
 * - Derives the Membership attribute from its single-owner sources (groupProperties + GKM groupTable/groupKeyMap);
 *   legacy Groups cluster groups appear automatically via their groupTable entries.
 * - Drives {@link FabricGroups} multicast address policy from the derived membership.
 * - Registers an {@link AccessControlServer.AuxAclObservable} to supply synthetic ACL entries for groups
 *   with `hasAuxiliaryAcl=true`. AccessControlServer calls back to collect entries when needed.
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

        // Membership is a derived-overwrite cache: fabric-scoping keeps it persisted, but #deriveMembership rebuilds
        // it from its sources on every input change, so the stored copy is never authoritative and cannot diverge.
        this.#deriveMembership();

        // Keep in sync as fabrics are added, replaced or removed.  A replaced fabric gets a fresh Groups instance,
        // so the multicast address policies must be re-applied from the derived membership.
        this.reactTo(fabrics.events.added, this.#deriveNow, { offline: true });
        this.reactTo(fabrics.events.replaced, this.#deriveNow, { offline: true });
        this.reactTo(fabrics.events.deleted, this.#handleFabricDeleted, { offline: true });

        // GKM owns endpoints (groupTable) and keySetId (groupKeyMap); any external change to either (e.g. legacy
        // Groups cluster commands or direct attribute writes) must re-derive Membership and its auxiliary ACLs.  A
        // fabric removal clears both attributes in one cascade, firing both reactors against the same groupcast.state:
        // #deriveNow derives inline while the lock is free but defers to an async-locked derive the moment it is not,
        // so the second reactor in a cascade never conflicts synchronously.
        const gkmEvents = this.endpoint.eventsOf(GroupKeyManagementServer);
        this.reactTo(gkmEvents.groupTable$Changed, this.#handleGroupTableChanged, { offline: true });
        this.reactTo(gkmEvents.groupKeyMap$Changed, this.#deriveNow, { offline: true });

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

        const membership = this.state.membership;
        const isNew = !membership.some(m => m.groupId === groupId && m.fabricIndex === fabricIndex);

        if (isNew) {
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
                if (this.#computeUsedMcastAddrCount(membership) >= this.state.maxMcastAddrCount) {
                    throw new StatusResponseError("MaxMcastAddrCount limit reached", Status.ResourceExhausted);
                }
            } else if (policy === Groupcast.MulticastAddrPolicy.IanaAddr) {
                // IanaAddr pool counts as 1 address; only check if pool not yet allocated
                const hasIanaAddr = membership.some(m => m.mcastAddrPolicy === Groupcast.MulticastAddrPolicy.IanaAddr);
                if (!hasIanaAddr && this.#computeUsedMcastAddrCount(membership) >= this.state.maxMcastAddrCount) {
                    throw new StatusResponseError("MaxMcastAddrCount limit reached", Status.ResourceExhausted);
                }
            }
        }

        const gkm = this.agent.get(GroupKeyManagementServer);
        const fabric = this.env.get(FabricManager).for(fabricIndex);

        // Set the policy before writing endpoints so the endpoint-driven multicast bind uses the right address up
        // front and avoids a follow-up rebind (correctness no longer depends on this order — see #rebindGroupMembership).
        fabric.groups.setGroupMulticastPolicy(
            groupId,
            policy === Groupcast.MulticastAddrPolicy.PerGroup ? "perGroupId" : "ianaAddr",
        );

        let keepsSenderOnly = false;
        if (this.features.listener) {
            const existing = gkm.state.groupTable.find(g => g.fabricIndex === fabricIndex && g.groupId === groupId);
            // Snapshot: removeEndpoint mutates the live groupTable endpoints array, which would corrupt this loop.
            const existingEndpoints = [...(existing?.endpoints ?? [])];
            const groupName = existing?.groupName ?? "";
            const target = replaceEndpoints ? endpoints : [...new Set([...existingEndpoints, ...endpoints])];
            // Replacing a listener's endpoints with none keeps the group sender-only.
            keepsSenderOnly = target.length === 0 && existingEndpoints.length > 0;
            for (const ep of existingEndpoints) {
                if (!target.includes(ep)) {
                    gkm.removeEndpoint(fabric, ep, groupId);
                }
            }
            for (const ep of target) {
                gkm.addEndpointForGroup(fabric, groupId, ep, groupName);
            }
        }

        this.#setGroupKeyMapping(fabric, fabricIndex, groupId, keySetId);

        this.#upsertGroupProperties(fabricIndex, groupId, {
            mcastAddrPolicy: policy,
            ...(useAuxiliaryAcl !== undefined ? { hasAuxiliaryAcl: useAuxiliaryAcl } : {}),
        });

        this.#deriveMembership();

        // Marked only once the method is committing successfully, so a throw earlier in this method never leaves
        // a leaked mark for the offline groupTable$Changed prune to wrongly consume later.
        if (keepsSenderOnly) {
            this.internal.retainedSenderOnly.add(`${fabricIndex}:${groupId}`);
        }

        /* The GroupKeyManagement GroupcastAdoption attribute is not supported by the default server:
        gkm.setGroupcastAdopted(fabricIndex, true);
        */
    }

    override leaveGroup(request: Groupcast.LeaveGroupRequest): Groupcast.LeaveGroupResponse {
        assertRemoteActor(this.context);
        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const { groupId, endpoints: requestedEndpoints } = request;

        const gkm = this.agent.get(GroupKeyManagementServer);
        const fabric = this.env.get(FabricManager).for(fabricIndex);

        // GroupID 0 = wildcard: leave ALL groups for this fabric
        if (groupId === GroupId.NO_GROUP_ID) {
            const removedGroupIds = this.state.membership
                .filter(m => m.fabricIndex === fabricIndex)
                .map(m => m.groupId);
            if (removedGroupIds.length === 0) {
                throw new StatusResponseError("No groups to leave", Status.NotFound);
            }
            const removed = new Set<GroupId>(removedGroupIds);
            for (const removedGroupId of removedGroupIds) {
                const table = gkm.state.groupTable.find(
                    g => g.fabricIndex === fabricIndex && g.groupId === removedGroupId,
                );
                for (const ep of [...(table?.endpoints ?? [])]) {
                    gkm.removeEndpoint(fabric, ep, removedGroupId);
                }
                this.#removeGroupProperties(fabricIndex, removedGroupId);
            }
            this.#removeGroupKeyMappings(fabric, fabricIndex, removed);
            this.#deriveMembership();
            return { groupId: GroupId.NO_GROUP_ID, endpoints: [] };
        }

        const entry = this.state.membership.find(m => m.groupId === groupId && m.fabricIndex === fabricIndex);
        if (entry === undefined) {
            throw new StatusResponseError(`Group ${groupId} not found`, Status.NotFound);
        }

        const currentEndpoints = entry.endpoints ?? [];
        let removedEndpoints: EndpointNumber[];
        let entryRemoved = false;
        let keepsSenderOnly = false;

        if (!requestedEndpoints || requestedEndpoints.length === 0) {
            // No specific endpoints specified → remove entire entry
            removedEndpoints = [...currentEndpoints];
            entryRemoved = true;
        } else {
            removedEndpoints = requestedEndpoints.filter(ep => currentEndpoints.includes(ep));
            const remainingEndpoints = currentEndpoints.filter(ep => !requestedEndpoints.includes(ep));
            // A listener entry losing all endpoints survives as sender-only when the Sender feature is enabled and
            // disappears otherwise, matching the derived-membership existence rule.
            if (remainingEndpoints.length === 0 && !this.features.sender) {
                entryRemoved = true;
            } else if (remainingEndpoints.length === 0 && removedEndpoints.length > 0) {
                // Intentionally kept sender-only (spec kKeepGroupIfEmpty).
                keepsSenderOnly = true;
            }
        }

        for (const ep of removedEndpoints) {
            gkm.removeEndpoint(fabric, ep, groupId);
        }
        if (entryRemoved) {
            this.#removeGroupKeyMappings(fabric, fabricIndex, new Set([groupId]));
            this.#removeGroupProperties(fabricIndex, groupId);
        }

        this.#deriveMembership();

        // Marked only once the method is committing successfully, so a throw earlier in this method never leaves
        // a leaked mark for the offline groupTable$Changed prune to wrongly consume later.
        if (keepsSenderOnly) {
            this.internal.retainedSenderOnly.add(`${fabricIndex}:${groupId}`);
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

        if (!this.state.membership.some(m => m.groupId === groupId && m.fabricIndex === fabricIndex)) {
            throw new StatusResponseError(`Group ${groupId} not found`, Status.NotFound);
        }

        await this.#applyKeySet(fabricIndex, keySetId, key);

        this.#setGroupKeyMapping(this.env.get(FabricManager).for(fabricIndex), fabricIndex, groupId, keySetId);

        this.#deriveMembership();
    }

    configureAuxiliaryAcl(request: Groupcast.ConfigureAuxiliaryAclRequest) {
        assertRemoteActor(this.context);
        const fabricIndex = this.context.session.associatedFabric.fabricIndex;
        const { groupId, useAuxiliaryAcl } = request;

        if (!this.state.membership.some(m => m.groupId === groupId && m.fabricIndex === fabricIndex)) {
            throw new StatusResponseError(`Group ${groupId} not found`, Status.NotFound);
        }

        this.#upsertGroupProperties(fabricIndex, groupId, { hasAuxiliaryAcl: useAuxiliaryAcl });
        this.#deriveMembership();
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

    #handleFabricDeleted(fabric: Fabric) {
        this.internal.pendingFabricCleanups.add(fabric.fabricIndex);
        this.#deriveNow();
    }

    /**
     * React to external GKM groupTable changes (legacy Groups cluster commands, direct attribute writes).  A group
     * present in the OLD table but absent from the NEW one lost all its endpoints; per CHIP kDeleteGroupIfEmpty it must
     * be fully deleted rather than lingering as a phantom sender-only entry.  The out-transition is recorded before
     * deriving so a deferred derive still applies it (a cascade discards the losing reactor's oldTable).  Genuine
     * sender-only joins never had a groupTable entry, so they are never in oldTable and always survive.
     */
    #handleGroupTableChanged(newTable: GroupKeyManagement.GroupInfoMap[], oldTable: GroupKeyManagement.GroupInfoMap[]) {
        const present = new Set(newTable.map(g => `${g.fabricIndex}:${g.groupId}`));
        for (const g of oldTable) {
            const key = `${g.fabricIndex}:${g.groupId}`;
            if (!present.has(key)) {
                this.internal.pendingTableRemovals.add(key);
            }
        }
        this.#deriveNow();
    }

    /**
     * Derive membership from a reactor.  A single trigger takes the groupcast.state lock synchronously and derives
     * inline so callers observe the result on the same tick.  A fabric removal clears both GKM attributes in one
     * cascade, so the second (and later) reactors find the lock held: rather than throwing a synchronous conflict they
     * hand off to the debounced async-locked {@link #scheduleDerive}, which reruns once the lock frees.  All pruning
     * intent is recorded in the pending sets first, so whichever path runs applies it.
     */
    #deriveNow() {
        const transaction = this.context.transaction;
        try {
            transaction.addResourcesSync(this);
            transaction.beginSync();
        } catch (error) {
            SynchronousTransactionConflictError.accept(error);
            this.#scheduleDerive();
            return;
        }
        this.#applyPendingAndDerive(this.context);
    }

    /**
     * Deferred derive for a contended cascade: acquire the groupcast.state lock asynchronously (waiting for the current
     * holder instead of throwing) and rerun the pending prune plus derive exactly once, coalescing every trigger that
     * arrives before the lock is held.
     */
    #scheduleDerive() {
        if (this.internal.derivePending) {
            return;
        }
        this.internal.derivePending = true;

        let derive;
        try {
            derive = this.endpoint.act("groupcast-derive", async agent => {
                const self = agent.get(GroupcastServer);
                self.context.transaction.addResourcesSync(self);
                await self.context.transaction.begin();
                // Cleared only once the lock is held: a trigger arriving during the same cascade is coalesced into this
                // run, while a genuinely later change reschedules.
                self.internal.derivePending = false;
                self.#applyPendingAndDerive(self.context);
            });
        } catch (error) {
            // endpoint.act asserts the endpoint is active synchronously, so it can throw during teardown; resetting the
            // flag here keeps a live node's derivation from wedging permanently.
            this.internal.derivePending = false;
            logger.error("Failed to schedule groupcast membership derivation", error);
            return;
        }

        Promise.resolve(derive).catch(error => {
            this.internal.derivePending = false;
            logger.error("Failed to derive groupcast membership", error);
        });
    }

    /**
     * Apply the pruning accumulated by the reactors, then rebuild membership.  Departed fabrics drop all their
     * groupProperties and retained-sender-only marks; externally emptied groups drop their groupProperties unless a
     * groupcast command marked them sender-only (spec kKeepGroupIfEmpty), consuming the mark so a later external
     * removal still deletes them.  A group re-added before this runs is left untouched.
     */
    #applyPendingAndDerive(context: ActionContext) {
        const fabricCleanups = this.internal.pendingFabricCleanups;
        const tableRemovals = this.internal.pendingTableRemovals;

        // Marks consumed alongside a prune.  The non-transactional intent (pending sets + these marks) is only cleared
        // after #deriveMembership returns, so a throw there rolls back the groupProperties/membership writes AND leaves
        // the intent intact for the next trigger to retry.
        const marksToConsume = new Set<string>();

        if (fabricCleanups.size) {
            this.state.groupProperties = this.state.groupProperties.filter(p => !fabricCleanups.has(p.fabricIndex));
            // A FabricIndex can be reused by a later fabric; purge marks so none leak across that reuse.
            for (const key of this.internal.retainedSenderOnly) {
                if (fabricCleanups.has(FabricIndex(Number(key.split(":")[0])))) {
                    marksToConsume.add(key);
                }
            }
        }

        if (tableRemovals.size) {
            const gkm = this.agent.get(GroupKeyManagementServer);
            const present = new Set(gkm.state.groupTable.map(g => `${g.fabricIndex}:${g.groupId}`));
            const retained = this.internal.retainedSenderOnly;
            const toPrune = new Set<string>();
            for (const key of tableRemovals) {
                if (present.has(key)) {
                    continue;
                }
                // A groupcast command that emptied this group asked to keep it sender-only (spec kKeepGroupIfEmpty);
                // consume the mark so a later external removal of the same group still deletes it.
                if (retained.has(key)) {
                    marksToConsume.add(key);
                    continue;
                }
                toPrune.add(key);
            }
            if (toPrune.size) {
                this.state.groupProperties = this.state.groupProperties.filter(
                    p => !toPrune.has(`${p.fabricIndex}:${p.groupId}`),
                );
            }
        }

        this.#deriveMembership(context);

        if (fabricCleanups.size) {
            this.internal.pendingFabricCleanups = new Set<FabricIndex>();
        }
        if (tableRemovals.size) {
            this.internal.pendingTableRemovals = new Set<string>();
        }
        for (const key of marksToConsume) {
            this.internal.retainedSenderOnly.delete(key);
        }
    }

    /**
     * Rebuild the derived {@link Groupcast.Membership} list from its single-owner persisted sources: groupProperties
     * (existence + flags), GKM groupTable (endpoints) and GKM groupKeyMap (keySetId).  A group is a member iff it is
     * present in groupProperties (a groupcast join) or groupTable (legacy/shared endpoints); groupKeyMap alone does
     * not create membership.  Idempotent and writes no GKM state, so the source-change reactors cannot feed back.
     */
    #deriveMembership(context?: ActionContext) {
        const gkm = this.agent.get(GroupKeyManagementServer);
        const previousKeys = this.state.membership.map(m => ({ fabricIndex: m.fabricIndex, groupId: m.groupId }));
        const next = new Array<Groupcast.Membership>();

        const byKey = new Map<string, { fabricIndex: FabricIndex; groupId: GroupId }>();
        for (const p of this.state.groupProperties) {
            byKey.set(`${p.fabricIndex}:${p.groupId}`, { fabricIndex: p.fabricIndex, groupId: p.groupId });
        }
        for (const g of gkm.state.groupTable) {
            byKey.set(`${g.fabricIndex}:${g.groupId}`, { fabricIndex: g.fabricIndex, groupId: g.groupId });
        }

        for (const { fabricIndex, groupId } of byKey.values()) {
            const props = this.state.groupProperties.find(p => p.fabricIndex === fabricIndex && p.groupId === groupId);
            const table = gkm.state.groupTable.find(g => g.fabricIndex === fabricIndex && g.groupId === groupId);
            const keyEntry = gkm.state.groupKeyMap.find(k => k.fabricIndex === fabricIndex && k.groupId === groupId);
            // Copy: the entry must not alias GKM's live groupTable array, which addEndpointForGroup/removeEndpoint mutate.
            const endpoints = table ? [...table.endpoints] : [];
            const lnFields = this.features.listener
                ? { endpoints, hasAuxiliaryAcl: props?.hasAuxiliaryAcl ?? false }
                : {};
            next.push({
                groupId,
                ...lnFields,
                keySetId: keyEntry?.groupKeySetId ?? UNMAPPED_KEYSET_ID,
                mcastAddrPolicy: props?.mcastAddrPolicy ?? this.#defaultMcastAddrPolicy(),
                fabricIndex,
            });
        }

        this.state.membership = next;
        this.#updateUsedMcastAddrCount();
        this.#applyPoliciesAndAuxAcl(previousKeys, next, context ?? this.context);
    }

    /**
     * Apply the multicast address policy of each derived membership entry to its fabric's FabricGroups, drop the
     * policy of groups no longer present, and re-emit the auxiliary ACL entries.  Reproduces the policy/aux-ACL
     * portions of the former OUT mirror; it never writes GKM groupTable/groupKeyMap.
     */
    #applyPoliciesAndAuxAcl(
        previousKeys: { fabricIndex: FabricIndex; groupId: GroupId }[],
        next: Groupcast.Membership[],
        context: ActionContext,
    ) {
        const fabrics = this.env.get(FabricManager);
        for (const m of next) {
            if (!fabrics.has(m.fabricIndex)) {
                continue;
            }
            const policy = m.mcastAddrPolicy === Groupcast.MulticastAddrPolicy.PerGroup ? "perGroupId" : "ianaAddr";
            fabrics.for(m.fabricIndex).groups.setGroupMulticastPolicy(m.groupId, policy);
        }
        const present = new Set(next.map(m => `${m.fabricIndex}:${m.groupId}`));
        for (const { fabricIndex, groupId } of previousKeys) {
            if (present.has(`${fabricIndex}:${groupId}`) || !fabrics.has(fabricIndex)) {
                continue;
            }
            fabrics.for(fabricIndex).groups.removeGroupMulticastPolicy(groupId);
        }
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
     * Write a group→keySet mapping to the persisted GroupKeyMap attribute (source for the derived KeySetId) and the
     * operational fabric key-id map (runtime group-message decryption).  The operational map is set synchronously
     * here because GroupKeyManagement's own reactor updates it only on a later tick.
     */
    #setGroupKeyMapping(fabric: Fabric, fabricIndex: FabricIndex, groupId: GroupId, keySetId: number) {
        const gkm = this.agent.get(GroupKeyManagementServer);
        gkm.state.groupKeyMap = [
            ...gkm.state.groupKeyMap.filter(e => !(e.fabricIndex === fabricIndex && e.groupId === groupId)),
            { groupId, groupKeySetId: keySetId, fabricIndex },
        ];
        this.#syncOperationalKeyMap(fabric, fabricIndex, gkm);
    }

    /** Remove group→keySet mappings for the given groups from the persisted attribute and the operational map. */
    #removeGroupKeyMappings(fabric: Fabric, fabricIndex: FabricIndex, groupIds: Set<GroupId>) {
        const gkm = this.agent.get(GroupKeyManagementServer);
        gkm.state.groupKeyMap = gkm.state.groupKeyMap.filter(
            e => e.fabricIndex !== fabricIndex || !groupIds.has(e.groupId),
        );
        this.#syncOperationalKeyMap(fabric, fabricIndex, gkm);
    }

    /**
     * Rebuild the fabric's operational key-id map from the persisted GroupKeyMap (the source of truth), so unmapped
     * groups are excluded.  Done synchronously because GroupKeyManagement's own reactor updates it only on a later
     * tick, whereas commands and group-message decryption need it immediately.
     */
    #syncOperationalKeyMap(fabric: Fabric, fabricIndex: FabricIndex, gkm: GroupKeyManagementServer) {
        fabric.groups.groupKeyIdMap = new Map<GroupId, number>(
            gkm.state.groupKeyMap.filter(e => e.fabricIndex === fabricIndex).map(e => [e.groupId, e.groupKeySetId]),
        );
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

    /**
     * Default multicast address policy for a group with no explicit policy: PerGroup on PerGroupAddr-capable
     * devices (so legacy groups stay on their ff35 per-group address), else IanaAddr.
     */
    #defaultMcastAddrPolicy(): Groupcast.MulticastAddrPolicy {
        return this.features.perGroup ? Groupcast.MulticastAddrPolicy.PerGroup : Groupcast.MulticastAddrPolicy.IanaAddr;
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
                mcastAddrPolicy: changes.mcastAddrPolicy ?? this.#defaultMcastAddrPolicy(),
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

        /**
         * `fabricIndex:groupId` keys of groups a groupcast command intentionally kept as sender-only while emptying
         * their endpoints.  The groupTable$Changed prune consumes these so it deletes only externally-emptied groups
         * (legacy RemoveAllGroups = kDeleteGroupIfEmpty), never a spec-compliant sender-only survivor
         * (LeaveGroup with the Sender feature = kKeepGroupIfEmpty).
         */
        retainedSenderOnly = new Set<string>();

        /** True while a debounced derive is scheduled but has not yet acquired the groupcast.state lock. */
        derivePending = false;

        /**
         * `fabricIndex:groupId` keys of groups that left the GKM groupTable, awaiting the debounced derive's
         * kDeleteGroupIfEmpty prune.  Accumulated because coalescing discards each event's oldTable.
         */
        pendingTableRemovals = new Set<string>();

        /** Fabric indices of departed fabrics whose Groupcast-owned state the debounced derive must drop. */
        pendingFabricCleanups = new Set<FabricIndex>();
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

        /** Persisted per-group existence + policy metadata; the authoritative source for the derived Membership. */
        groupProperties: GroupPropertiesEntry[] = new Array<GroupPropertiesEntry>();
    }
}
