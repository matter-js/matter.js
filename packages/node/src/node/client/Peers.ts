/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteDescriptor } from "#behavior/system/commissioning/RemoteDescriptor.js";
import { CommissioningDiscovery } from "#behavior/system/controller/discovery/CommissioningDiscovery.js";
import { ContinuousDiscovery } from "#behavior/system/controller/discovery/ContinuousDiscovery.js";
import { Discovery } from "#behavior/system/controller/discovery/Discovery.js";
import { InstanceDiscovery } from "#behavior/system/controller/discovery/InstanceDiscovery.js";
import { EndpointContainer } from "#endpoint/properties/EndpointContainer.js";
import { CancelablePromise, Duration, ImplementationError, Logger, Minutes, Seconds, Time, Timestamp } from "#general";
import { FabricManager, PeerAddress, PeerAddressStore } from "#protocol";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import { ClientNode } from "../ClientNode.js";
import type { ServerNode } from "../ServerNode.js";
import { ClientNodeFactory } from "./ClientNodeFactory.js";
import { NodePeerAddressStore } from "./NodePeerAddressStore.js";

const logger = Logger.get("ClientNodes");

const DEFAULT_TTL = Minutes(15);
const EXPIRATION_INTERVAL = Minutes.one;

/**
 * Manages the set of known remote nodes.
 *
 * Remote nodes are either peers (commissioned into a fabric we share) or commissionable.
 */
export class Peers extends EndpointContainer<ClientNode> {
    #expirationInterval?: CancelablePromise;
    #expirationWorker?: Promise<void>;
    #closed = false;

    constructor(owner: ServerNode) {
        super(owner);

        if (!owner.env.has(ClientNodeFactory)) {
            owner.env.set(ClientNodeFactory, new Factory(this));
        }

        this.owner.env.set(PeerAddressStore, new NodePeerAddressStore(owner));

        this.added.on(this.#manageExpiration.bind(this));
        this.deleted.on(this.#manageExpiration.bind(this));
    }

    /**
     * Load nodes.  Invoked automatically by owner.
     */
    initialize() {
        const factory = this.owner.env.get(ClientNodeFactory);

        const clientStores = this.owner.env.get(ServerNodeStore).clientStores;
        for (const id of clientStores.knownIds) {
            this.add(
                factory.create({
                    id,
                    owner: this.owner,
                }),
            );
        }
    }

    /**
     * Find a specific commissionable node.
     */
    locate(options?: Discovery.Options) {
        return new InstanceDiscovery(this.owner, options);
    }

    /**
     * Employ discovery to find a set of commissionable nodes.
     *
     * If you do not provide a timeout value, will search until canceled and you need to add a listener to
     * {@link Discovery#discovered} or {@link added} to receive discovered nodes.
     */
    discover(options?: Discovery.Options) {
        return new ContinuousDiscovery(this.owner, options);
    }

    /**
     * Find a specific commissionable node and commission.
     */
    commission(options: CommissioningDiscovery.Options) {
        return new CommissioningDiscovery(this.owner, options);
    }

    override get(id: number | string | PeerAddress) {
        if (typeof id !== "string" && typeof id !== "number") {
            const address = PeerAddress(id);
            for (const node of this) {
                const nodeAddress = node.state.commissioning.peerAddress;
                if (nodeAddress && PeerAddress(nodeAddress) === address) {
                    return node;
                }
            }
            return undefined;
        }

        return super.get(id);
    }

    override get owner() {
        return super.owner as ServerNode;
    }

    override add(node: ClientNode) {
        node.owner = this.owner;

        super.add(node);
    }

    /**
     * Get or create a client node for the given peer address.
     * This is mainly used to communicate to other known nodes on the fabric without having a formal commissioning
     * process.
     */
    async forAddress(peerAddress: PeerAddress, options: Omit<ClientNode.Options, "owner"> = {}) {
        if (!this.owner.env.get(FabricManager).has(peerAddress)) {
            throw new ImplementationError("Cannot register a peer address for a fabric we do not belong to");
        }

        let node = this.get(peerAddress);
        if (!node) {
            // We do not have that node till now, also not persisted, so create it
            const factory = this.owner.env.get(ClientNodeFactory);
            node = factory.create(options);
            await node.construction;
            this.add(node);

            // Pin initial settings to the node that they get persisted, Can be adjusted later
            await node.set({
                network: {
                    startupSubscription: null,
                    isEnabled: false,
                    enabledOnStartUp: false,
                },
                commissioning: { peerAddress: PeerAddress(peerAddress) },
            });
        }

        return node;
    }

    override async close() {
        this.#closed = true;
        this.#cancelExpiration();
        await this.#expirationWorker;
        await super.close();
    }

    #cancelExpiration() {
        if (this.#expirationInterval) {
            this.#expirationInterval.cancel();
            this.#expirationInterval = undefined;
        }
    }

    #manageExpiration() {
        if (this.#closed || this.#expirationWorker) {
            return;
        }

        if (this.#expirationInterval) {
            if (!this.size) {
                this.#cancelExpiration();
            }
            return;
        }

        if (!this.size) {
            return;
        }

        this.#expirationInterval = Time.sleep("client node expiration", EXPIRATION_INTERVAL).then(
            this.#onExpirationIntervalElapsed.bind(this),
        );
    }

    #onExpirationIntervalElapsed() {
        this.#expirationInterval = undefined;
        this.#expirationWorker = this.#cullExpiredNodesAndAddresses()
            .catch(error => {
                logger.error("Error culling expired nodes", error);
            })
            .finally(() => {
                this.#expirationWorker = undefined;
                this.#manageExpiration();
            });
    }

    async #cullExpiredNodesAndAddresses() {
        const now = Time.nowMs;

        for (const node of this) {
            const state = node.state.commissioning;
            const { addresses } = state;
            const isCommissioned = state.peerAddress !== undefined;

            // Shortcut for conditions we know no change is possible
            if (addresses === undefined || (isCommissioned && addresses.length === 1)) {
                return;
            }

            // Remove expired addresses
            let newAddresses = addresses.filter(addr => {
                const exp = expirationOf(addr);
                if (exp === undefined) {
                    return true;
                }

                return exp > now;
            });

            // Cull commissionable nodes that have expired
            if (!isCommissioned) {
                if (!newAddresses?.length || (expirationOf(state) ?? 0) <= now) {
                    await node.delete();
                    continue;
                }
            }

            // If the node is commissioned, do not remove the last address.  Instead keep the "least expired" addresses
            if (isCommissioned && addresses.length && !newAddresses.length) {
                if (addresses.length === 1) {
                    return;
                }
                const freshestExp = addresses.reduce((freshestExp, addr) => {
                    return Math.max(freshestExp, expirationOf(addr)!);
                }, 0);

                newAddresses = addresses.filter(addr => expirationOf(addr) === freshestExp);
            }

            // Apply new addresses if changed
            if (addresses.length !== newAddresses.length) {
                await node.set({ commissioning: { addresses } });
            }
        }
    }
}

class Factory extends ClientNodeFactory {
    #owner: Peers;

    constructor(owner: Peers) {
        super();
        this.#owner = owner;
    }

    create(options: ClientNode.Options) {
        if (options.id === undefined) {
            options.id = this.#owner.owner.env.get(ServerNodeStore).clientStores.allocateId();
        }
        const node = new ClientNode({
            ...options,
            owner: this.#owner.owner,
        });
        node.construction.start();
        return node;
    }

    find(descriptor: RemoteDescriptor) {
        for (const node of this.#owner) {
            if (RemoteDescriptor.is(node.state.commissioning, descriptor)) {
                return node;
            }
        }
    }

    get nodes() {
        return this.#owner;
    }
}

function expirationOf<T extends { discoveredAt?: Timestamp; ttl?: Duration | number }>(
    lifespan: T,
): T extends { discoveredAt: Timestamp } ? Timestamp : Timestamp | undefined {
    if (lifespan.discoveredAt !== undefined) {
        return Timestamp(lifespan.discoveredAt + (Seconds(lifespan.ttl) ?? DEFAULT_TTL));
    }
    return undefined as unknown as Timestamp;
}
