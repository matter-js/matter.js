/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Construction, Environment, InternalError, Logger, ObserverGroup, UdpTransport } from "@matter/general";
import { Fabric, FabricManager } from "@matter/protocol";
import { FabricIndex, GroupId } from "@matter/types";

const logger = Logger.get("ServerGroupNetworking");

export class ServerGroupNetworking {
    #construction: Construction<ServerGroupNetworking>;
    #udpInterface: UdpTransport;
    #activeGroupMemberships = new Map<FabricIndex, Map<GroupId, string>>();
    #fabricObservers = new Map<FabricIndex, ObserverGroup>();
    #observers = new ObserverGroup(this);

    get construction() {
        return this.#construction;
    }

    /**
     * The server group networking is not implemented in the Node.js environment.
     * This class is a placeholder to maintain compatibility with the Matter.js architecture.
     */
    constructor(env: Environment, udpInterface: UdpTransport) {
        this.#udpInterface = udpInterface;
        this.#construction = Construction(this);
        this.#construction.start(env);
    }

    async [Construction.construct](env: Environment) {
        const fabrics = env.get(FabricManager);

        for (const fabric of fabrics) {
            if (this.#activeGroupMemberships.has(fabric.fabricIndex)) {
                throw new InternalError("Group transport interfaces already initialized for this fabric.");
            }
            for (const groupId of fabric.groups.endpoints.keys()) {
                await this.#addGroupMembership(groupId, fabric);
            }

            this.#registerFabricGroupObserver(fabric);
        }

        // When new fabric is added we register for group changes - new fabrics cannot have groups already configured
        this.#observers.on(fabrics.events.added, async fabric => this.#registerFabricGroupObserver(fabric));

        // When fabric is deleted, we remove the group memberships
        this.#observers.on(fabrics.events.deleting, async fabric => {
            const fabricIndex = fabric.fabricIndex;
            this.#observersForFabric(fabricIndex).close();
            this.#fabricObservers.delete(fabricIndex);

            const memberships = this.#activeGroupMemberships.get(fabricIndex);
            if (memberships === undefined || memberships.size === 0) {
                this.#activeGroupMemberships.delete(fabricIndex);
                return;
            }
            for (const groupId of memberships.keys()) {
                await this.#dropGroupMembership(groupId, fabric);
            }
            this.#activeGroupMemberships.delete(fabricIndex);
        });

        this.#observers.on(fabrics.events.replaced, async fabric => {
            const fabricIndex = fabric.fabricIndex;

            this.#observersForFabric(fabricIndex).close();
            this.#fabricObservers.delete(fabricIndex);
            this.#registerFabricGroupObserver(fabric);

            // Sync (add or remove as needed) by new group configuration
            const { endpoints } = fabric.groups;
            for (const groupId of endpoints.keys()) {
                await this.#addGroupMembership(groupId, fabric);
            }
            const memberships = this.#activeGroupMemberships.get(fabricIndex) ?? new Map<GroupId, string>();
            if (memberships.size !== 0) {
                for (const groupId of memberships.keys()) {
                    if (!endpoints.has(groupId)) {
                        await this.#dropGroupMembership(groupId, fabric);
                    }
                }
            }
        });
    }

    async #addGroupMembership(groupId: GroupId, fabric: Fabric) {
        const fabricIndex = fabric.fabricIndex;
        const memberships = this.#activeGroupMemberships.get(fabricIndex) ?? new Map<GroupId, string>();
        if (memberships.has(groupId)) {
            return;
        }
        const address = fabric.groups.multicastAddressFor(groupId);
        // Only join the multicast group if no other group in this fabric already uses the same address
        // (multiple IanaAddr groups all share ff05::fa).  Reserve the address before awaiting so concurrent adds
        // in the same synchronous batch do not double-join.
        const needsJoin = !this.#otherGroupUsesAddress(memberships, address, groupId);
        memberships.set(groupId, address);
        this.#activeGroupMemberships.set(fabricIndex, memberships);
        if (needsJoin) {
            logger.debug(
                `Adding membership for group ${groupId} on fabric ${fabric.fabricId} (index ${fabricIndex}) with address ${address}`,
            );
            await this.#udpInterface.addMembership(address);
        }
    }

    async #dropGroupMembership(groupId: GroupId, fabric: Fabric) {
        const fabricIndex = fabric.fabricIndex;
        const memberships = this.#activeGroupMemberships.get(fabricIndex);
        if (memberships === undefined || memberships.size === 0) {
            return;
        }
        // Use the stored address (safer than re-deriving, policy may have changed)
        const address = memberships.get(groupId) ?? fabric.groups.multicastAddressFor(groupId);
        const stillUsed = this.#otherGroupUsesAddress(memberships, address, groupId);
        memberships.delete(groupId);
        // Only leave the multicast group if no other group in this fabric still uses the same address
        // (multiple IanaAddr groups all share ff05::fa)
        if (!stillUsed) {
            logger.debug(
                `Dropping membership for group ${groupId} on fabric ${fabric.fabricId} (index ${fabricIndex}) with address ${address}`,
            );
            await this.#udpInterface.dropMembership(address);
        }
        if (!memberships.size) {
            this.#activeGroupMemberships.delete(fabricIndex);
        }
    }

    /**
     * React to a change of a group's multicast address policy.  Endpoint restore (GKM) and policy application
     * (Groupcast) can run in either order on reload/fabric-replace, so a group's bound address can go stale
     * regardless of which side reacts first; this rebinds it whenever the resolved address no longer matches
     * what is actually joined.
     */
    async #rebindGroupMembership(groupId: GroupId, fabric: Fabric) {
        const fabricIndex = fabric.fabricIndex;
        // BasicMap emits added/changed/deleted before committing the mutation to the underlying Map (see Map.ts),
        // so both the resolved address and the currently-joined address must be read AFTER a one-microtask yield
        // that lets the emitting set()/delete() commit.  Reading live state post-yield also lets back-to-back
        // policy changes for the same group converge without a redundant rebind.
        await Promise.resolve();
        const memberships = this.#activeGroupMemberships.get(fabricIndex);
        const oldAddress = memberships?.get(groupId);
        if (memberships === undefined || oldAddress === undefined) {
            return;
        }
        const newAddress = fabric.groups.multicastAddressFor(groupId);
        if (newAddress === oldAddress) {
            return;
        }

        const stillUsedOld = this.#otherGroupUsesAddress(memberships, oldAddress, groupId);
        const alreadyJoinedNew = this.#otherGroupUsesAddress(memberships, newAddress, groupId);
        memberships.set(groupId, newAddress);

        logger.debug(
            `Rebinding group ${groupId} on fabric ${fabric.fabricId} (index ${fabricIndex}) from ${oldAddress} to ${newAddress}`,
        );
        if (!stillUsedOld) {
            await this.#udpInterface.dropMembership(oldAddress);
        }
        if (!alreadyJoinedNew) {
            await this.#udpInterface.addMembership(newAddress);
        }
    }

    /** Whether any group other than {@link excludeGroupId} in {@link memberships} still resolves to {@link address}. */
    #otherGroupUsesAddress(memberships: Map<GroupId, string>, address: string, excludeGroupId: GroupId) {
        for (const [id, mappedAddress] of memberships) {
            if (id !== excludeGroupId && mappedAddress === address) {
                return true;
            }
        }
        return false;
    }

    #observersForFabric(fabricIndex: FabricIndex) {
        let observers = this.#fabricObservers.get(fabricIndex);
        if (observers === undefined) {
            observers = new ObserverGroup(this);
            this.#fabricObservers.set(fabricIndex, observers);
        }
        return observers;
    }

    #registerFabricGroupObserver(fabric: Fabric) {
        const fabricIndex = fabric.fabricIndex;

        // Multicast membership follows group existence (groups with endpoints to receive for), not key availability:
        // a group whose key mapping was removed still receives datagrams so Groupcast testing can report NoAvailableKey
        const observers = this.#observersForFabric(fabricIndex);
        observers.on(fabric.groups.endpoints.added, async groupId => await this.#addGroupMembership(groupId, fabric));

        observers.on(fabric.groups.endpoints.deleted, async groupId => this.#dropGroupMembership(groupId, fabric));

        // A group's resolved address can change independent of endpoint add/remove (e.g. Groupcast applying its
        // policy after GKM has already restored endpoints on reload/fabric-replace).
        const rebind = async (groupId: GroupId) => this.#rebindGroupMembership(groupId, fabric);
        observers.on(fabric.groups.multicastPolicy.added, rebind);
        observers.on(fabric.groups.multicastPolicy.changed, rebind);
        observers.on(fabric.groups.multicastPolicy.deleted, rebind);
    }

    close() {
        this.#construction.close();
        this.#observers.close();
        this.#fabricObservers.forEach(observer => observer.close());
        this.#activeGroupMemberships.clear();
        this.#fabricObservers.clear();
    }
}
