/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Construction,
    Duration,
    Environment,
    InternalError,
    Logger,
    ObserverGroup,
    Seconds,
    Time,
    UdpTransport,
} from "@matter/general";
import { Fabric, FabricManager } from "@matter/protocol";
import { FabricIndex, GroupId } from "@matter/types";

const logger = Logger.get("ServerGroupNetworking");

const JOIN_RETRY_INTERVAL = Seconds(30);

/**
 * Joins the multicast address of every group the fabrics use on the node's UDP transport and follows group changes.
 * An address stays joined while any fabric still uses it.
 */
export class ServerGroupNetworking {
    #construction: Construction<ServerGroupNetworking>;
    #udpInterface: UdpTransport;

    /** Address each group of each fabric wants to receive on.  Updated synchronously by the group observers. */
    #desired = new Map<FabricIndex, Map<GroupId, string>>();

    /** Addresses the socket has actually joined.  Changed only after addMembership/dropMembership succeeded. */
    #joined = new Set<string>();

    #reconciling?: Promise<void>;
    #reconcileRequested = false;
    #closed = false;
    #joinRetry = Time.getTimer("Retry multicast joins", JOIN_RETRY_INTERVAL, () => this.#reconcile());
    #fabricObservers = new Map<FabricIndex, ObserverGroup>();
    #observers = new ObserverGroup(this);

    get construction() {
        return this.#construction;
    }

    constructor(env: Environment, udpInterface: UdpTransport) {
        this.#udpInterface = udpInterface;
        this.#construction = Construction(this);
        this.#construction.start(env);
    }

    async [Construction.construct](env: Environment) {
        const fabrics = env.get(FabricManager);

        for (const fabric of fabrics) {
            if (this.#desired.has(fabric.fabricIndex)) {
                throw new InternalError("Group transport interfaces already initialized for this fabric.");
            }
            for (const groupId of fabric.groups.endpoints.keys()) {
                this.#want(groupId, fabric);
            }
            this.#registerFabricGroupObserver(fabric);
        }

        // When new fabric is added we register for group changes - new fabrics cannot have groups already configured
        this.#observers.on(fabrics.events.added, fabric => this.#registerFabricGroupObserver(fabric));

        this.#observers.on(fabrics.events.deleting, fabric => {
            const fabricIndex = fabric.fabricIndex;
            this.#observersForFabric(fabricIndex).close();
            this.#fabricObservers.delete(fabricIndex);
            this.#desired.delete(fabricIndex);
            return this.#reconcile();
        });

        this.#observers.on(fabrics.events.replaced, fabric => {
            const fabricIndex = fabric.fabricIndex;
            this.#observersForFabric(fabricIndex).close();
            this.#fabricObservers.delete(fabricIndex);
            this.#registerFabricGroupObserver(fabric);

            this.#desired.delete(fabricIndex);
            for (const groupId of fabric.groups.endpoints.keys()) {
                this.#want(groupId, fabric);
            }
            return this.#reconcile();
        });

        await this.#reconcile();
    }

    #want(groupId: GroupId, fabric: Fabric) {
        const fabricIndex = fabric.fabricIndex;
        let groups = this.#desired.get(fabricIndex);
        if (groups === undefined) {
            groups = new Map<GroupId, string>();
            this.#desired.set(fabricIndex, groups);
        }
        groups.set(groupId, fabric.groups.multicastAddressFor(groupId));
    }

    #unwant(groupId: GroupId, fabricIndex: FabricIndex) {
        const groups = this.#desired.get(fabricIndex);
        groups?.delete(groupId);
        if (groups?.size === 0) {
            this.#desired.delete(fabricIndex);
        }
    }

    /**
     * Bring the joined addresses in line with the desired ones.  Runs serialized: a request while a run is active
     * repeats the run once it completes, so every change is applied and no two runs touch the socket concurrently.
     * The UDP socket is shared by all fabrics and IanaAddr groups of every fabric use ff05::fa, so an address is
     * joined once and left when no group of any fabric wants it.
     */
    #reconcile(): Promise<void> {
        this.#reconcileRequested = true;
        // The run starts on the next microtask so this assignment precedes the run's own reset in its finally block
        this.#reconciling ??= Promise.resolve().then(() => this.#runReconcile());
        return this.#reconciling;
    }

    async #runReconcile() {
        try {
            await this.#reconcileUntilSettled();
        } finally {
            this.#reconciling = undefined;
        }
    }

    async #reconcileUntilSettled() {
        let failedJoin = false;
        while (this.#reconcileRequested && !this.#closed) {
            failedJoin = false;
            this.#reconcileRequested = false;

            const wanted = new Set<string>();
            for (const groups of this.#desired.values()) {
                for (const address of groups.values()) {
                    wanted.add(address);
                }
            }

            for (const address of [...this.#joined]) {
                if (!wanted.has(address)) {
                    await this.#leave(address);
                }
            }
            for (const address of wanted) {
                if (!this.#joined.has(address) && !this.#closed) {
                    if (!(await this.#join(address))) {
                        failedJoin = true;
                    }
                }
            }
        }
        if (failedJoin && !this.#closed && !this.#joinRetry.isRunning) {
            this.#joinRetry.start();
        }
    }

    async #join(address: string) {
        logger.debug(`Joining multicast address ${address}`);
        try {
            await this.#udpInterface.addMembership(address);
            this.#joined.add(address);
            return true;
        } catch (error) {
            logger.warn(
                `Failed to join multicast address ${address}, retrying in ${Duration.format(JOIN_RETRY_INTERVAL)}`,
                error,
            );
            return false;
        }
    }

    async #leave(address: string) {
        logger.debug(`Leaving multicast address ${address}`);
        try {
            await this.#udpInterface.dropMembership(address);
            this.#joined.delete(address);
        } catch (error) {
            if (this.#closed) {
                logger.debug(`Failed to leave multicast address ${address} during close`, error);
            } else {
                logger.warn(`Failed to leave multicast address ${address}`, error);
            }
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

        // Multicast membership follows group existence (groups with endpoints to receive for), not key availability:
        // a group whose key mapping was removed still receives datagrams so Groupcast testing can report NoAvailableKey
        const observers = this.#observersForFabric(fabricIndex);
        observers.on(fabric.groups.endpoints.added, groupId => {
            this.#want(groupId, fabric);
            return this.#reconcile();
        });
        observers.on(fabric.groups.endpoints.deleted, groupId => {
            this.#unwant(groupId, fabricIndex);
            return this.#reconcile();
        });

        // A group's resolved address can change independent of endpoint add/remove (e.g. Groupcast applying its
        // policy after GKM has already restored endpoints on reload/fabric-replace).  The policy map emits before it
        // commits the value, so the address is read after a yield.
        const rebind = async (groupId: GroupId) => {
            await Promise.resolve();
            // A replaced fabric registers new observers; the old fabric's pending rebind must not overwrite its address
            if (this.#fabricObservers.get(fabricIndex) === observers && this.#desired.get(fabricIndex)?.has(groupId)) {
                this.#want(groupId, fabric);
                await this.#reconcile();
            }
        };
        observers.on(fabric.groups.multicastPolicy.added, rebind);
        observers.on(fabric.groups.multicastPolicy.changed, rebind);
        observers.on(fabric.groups.multicastPolicy.deleted, rebind);
    }

    async close() {
        this.#construction.close();
        this.#observers.close();
        this.#fabricObservers.forEach(observer => observer.close());
        this.#fabricObservers.clear();

        // Leave every joined multicast group before the shared UDP socket is torn down.  A Node dgram socket left
        // with active memberships can hang on close(), which would block the runtime shutdown from completing.
        this.#closed = true;
        this.#joinRetry.stop();
        this.#desired.clear();
        await this.#reconciling;
        for (const address of [...this.#joined]) {
            await this.#leave(address);
        }
    }
}
