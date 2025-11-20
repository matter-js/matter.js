/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Construction, Environment, InternalError, Logger, ObserverGroup, UdpInterface } from "#general";
import { Fabric, FabricManager } from "#protocol";
import { FabricIndex, GroupId } from "#types";

const logger = Logger.get("ServerGroupNetworking");

export class ServerGroupNetworking {
    #construction: Construction<ServerGroupNetworking>;
    #udpInterface: UdpInterface;
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
    constructor(env: Environment, udpInterface: UdpInterface) {
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
            for (const groupId of fabric.groups.groupKeyIdMap.keys()) {
                await this.#addGroupMembership(groupId, fabric);
            }

            this.#registerFabricGroupObserver(fabric);
        }

        // When new fabric is added we register for group changes - new fabrics cannot have groups already configured
        this.#observers.on(fabrics.events.added, async fabric => this.#registerFabricGroupObserver(fabric));

        // When fabric is deleted, we remove the group memberships
        this.#observers.on(fabrics.events.deleted, async fabric => {
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
            const { groupKeyIdMap } = fabric.groups;
            for (const groupId of groupKeyIdMap.keys()) {
                await this.#addGroupMembership(groupId, fabric);
            }
            const memberships = this.#activeGroupMemberships.get(fabricIndex) ?? new Map<GroupId, string>();
            if (memberships.size !== 0) {
                for (const groupId of memberships.keys()) {
                    if (!groupKeyIdMap.has(groupId)) {
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
        logger.debug(
            `Adding membership for group ${groupId} on fabric ${fabric.fabricId} (index ${fabricIndex}) with address ${address}`,
        );
        await this.#udpInterface.addMembership(address);
        memberships.set(groupId, address);
        this.#activeGroupMemberships.set(fabricIndex, memberships);
    }

    async #dropGroupMembership(groupId: GroupId, fabric: Fabric) {
        const fabricIndex = fabric.fabricIndex;
        const memberships = this.#activeGroupMemberships.get(fabricIndex);
        if (memberships === undefined || memberships.size === 0) {
            return;
        }
        const address = fabric.groups.multicastAddressFor(groupId);
        logger.debug(
            `Dropping membership for group ${groupId} on fabric ${fabric.fabricId} (index ${fabricIndex}) with address ${address}`,
        );
        await this.#udpInterface.dropMembership(address);
        memberships.delete(groupId);
        if (!memberships.size) {
            this.#activeGroupMemberships.delete(fabricIndex);
        }
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

        const observers = this.#observersForFabric(fabricIndex);
        observers.on(
            fabric.groups.groupKeyIdMap.added,
            async groupId => await this.#addGroupMembership(groupId, fabric),
        );

        observers.on(fabric.groups.groupKeyIdMap.deleted, async groupId => this.#dropGroupMembership(groupId, fabric));
    }

    close() {
        this.#construction.close();
        this.#observers.close();
        this.#fabricObservers.forEach(observer => observer.close());
        this.#activeGroupMemberships.clear();
        this.#fabricObservers.clear();
    }
}
