/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { ClientNetworkRuntime } from "#behavior/system/network/ClientNetworkRuntime.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { NetworkRuntime } from "#behavior/system/network/NetworkRuntime.js";
import { Agent } from "#endpoint/Agent.js";
import { ClientNodeEndpoints } from "#endpoint/properties/ClientNodeEndpoints.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { ClientNodeStore } from "#storage/client/ClientNodeStore.js";
import { RemoteWriter } from "#storage/client/RemoteWriter.js";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import {
    DependencyLifecycleError,
    Diagnostic,
    Identity,
    ImplementationError,
    InternalError,
    Lifecycle,
    Logger,
    MaybePromise,
} from "@matter/general";
import { Matter, MatterModel } from "@matter/model";
import { Interactable, OccurrenceManager, PeerAddress, PeerSet } from "@matter/protocol";
import { ClientEndpointInitializer } from "./client/ClientEndpointInitializer.js";
import { ClientNodeInteraction } from "./client/ClientNodeInteraction.js";
import { Node } from "./Node.js";
import type { ServerNode } from "./ServerNode.js";

const logger = Logger.get("ClientNode");

/**
 * A remote Matter {@link Node}.
 *
 * Client nodes may be peers (commissioned into a shared fabric) or commissionable, in which they are not usable until
 * you invoke {@link commissioned}.
 */
export class ClientNode extends Node<ClientNode.RootEndpoint> {
    #matter: MatterModel;
    #interaction?: ClientNodeInteraction;
    #blockInteractions = false;
    #cachedPeerAddress?: PeerAddress;

    constructor(options: ClientNode.Options) {
        const opts = {
            ...options,
            number: 0,

            // Create an unfrozen type so we can set the revision when we see the descriptor
            type: MutableEndpoint(ClientNode.RootEndpoint),
        };

        super(opts);

        // Block the OccurrenceManager from the parent environment so we don't attempt to record events from peers
        this.env.close(OccurrenceManager);

        this.env.set(Node, this);
        this.env.set(ClientNode, this);

        this.#matter = options.matter ?? Matter;
    }

    get isGroup() {
        return false;
    }

    /**
     * Model of Matter semantics understood by this node.
     *
     * Matter elements missing from this model will not support all functionality.
     */
    get matter() {
        return this.#matter;
    }

    override get endpoints(): ClientNodeEndpoints {
        return new ClientNodeEndpoints(this);
    }

    protected get store() {
        return this.env.get(ServerNodeStore).clientStores.storeForNode(this);
    }

    // This needs to be sync to ensure a sync initialization
    override initialize() {
        const store = this.store;

        this.env.set(ClientNodeStore, store);

        const initializer = new ClientEndpointInitializer(this);
        this.env.set(EndpointInitializer, initializer);

        store.write = RemoteWriter(this, initializer.structure);

        ClientCacheBuffer.configure(this, store);

        initializer.structure.loadCache(store.endpointStores);

        const promise = super.initialize();

        if (store.isPreexisting && promise !== undefined) {
            // We initialize ClientNodes on-demand but want them fully initialized for immediate use.  This means
            // initialization must be synchronous.  Enforce this here to ensure we don't accidentally break this
            // contract
            throw new InternalError("Unsupported async initialization detected when loading known peer");
        }

        return promise;
    }

    override get owner(): ServerNode {
        const owner = super.owner;
        if (owner === undefined) {
            throw new InternalError("Client node is missing owner");
        }
        return super.owner as ServerNode;
    }

    override set owner(owner: ServerNode) {
        super.owner = owner;
    }

    /**
     * Add this node to a fabric.
     */
    async commission(options: CommissioningClient.CommissioningOptions) {
        await this.act("commission", agent => agent.commissioning.commission(options));
    }

    /**
     * Remove this node from the fabric (if commissioned) and locally.
     * This method tries to communicate with the device to decommission it properly and will fail if the device is
     * unreachable.
     * If you cannot reach the device, use {@link delete} instead.
     */
    async decommission() {
        this.lifecycle.change(EndpointLifecycle.Change.Destroying);

        if (this.lifecycle.isCommissioned) {
            this.statusUpdate("decommissioning");

            await this.act("decommission", agent => agent.commissioning.decommission());
        }

        await this.delete();
    }

    /**
     * Force-remove the node without first decommissioning.
     *
     * If the node is still available, you should use {@link decommission} to remove it properly from the fabric and only use
     * this method as fallback.  You should inform the user that manual factory-reset may be necessary.
     */
    override async delete() {
        const address = this.peerAddress;

        await super.delete();

        // Ensure there is no remaining @matter/protocol Peer installed.  This may occur if deleted while still
        // commissioned
        if (address) {
            await this.env.maybeGet(PeerSet)?.get(address)?.delete();
        }
    }

    override async erase() {
        await this.lifecycle.mutex.produce(this.eraseWithMutex.bind(this));
    }

    /**
     * Disable the node.
     *
     * This shuts down any active connections and prevents future connections until re-enabled.
     */
    async disable() {
        if (this.state.network.isDisabled) {
            return;
        }

        await this.lifecycle.mutex.produce(async () => {
            await this.cancelWithMutex();
            await this.setStateOf(NetworkClient, { isDisabled: true });
        });
    }

    /**
     * Enable the node.
     *
     * If the node is disabled but reachable, this brings it online.
     */
    async enable() {
        if (!this.state.network.isDisabled) {
            return;
        }

        await this.setStateOf(NetworkClient, { isDisabled: false });
        await this.start();
    }

    protected async eraseWithMutex() {
        await this.cancelWithMutex();
        await super.resetWithMutex();
        this.#cachedPeerAddress = undefined;
        await this.env.get(EndpointInitializer).eraseDescendant(this);
    }

    protected override async resetWithMutex() {
        this.#cachedPeerAddress = undefined;
        await super.resetWithMutex();
    }

    protected createRuntime(): NetworkRuntime {
        return new ClientNetworkRuntime(this);
    }

    async prepareRuntimeShutdown() {}

    protected override async cancelWithMutex() {
        // TODO Revisit this blocking mechanism because we might need it more general?
        //  Maybe let it be created but have a check in ClientNodeInteraction which decided if allowed or not?
        this.#blockInteractions = true;
        try {
            const interaction = this.#interaction;
            this.#interaction = undefined;
            await interaction?.close();
            await super.cancelWithMutex();
        } finally {
            this.#blockInteractions = false;
        }
    }

    protected override get container() {
        return this.owner?.peers;
    }

    override act<R>(
        purpose: string,
        actor: (agent: Agent.Instance<ClientNode.RootEndpoint>) => MaybePromise<R>,
    ): MaybePromise<R>;

    override act<R>(actor: (agent: Agent.Instance<ClientNode.RootEndpoint>) => MaybePromise<R>): MaybePromise<R>;

    override act<R>(
        actorOrPurpose: string | ((agent: Agent.Instance<ClientNode.RootEndpoint>) => MaybePromise<R>),
        actor?: (agent: Agent.Instance<ClientNode.RootEndpoint>) => MaybePromise<R>,
    ): MaybePromise<R> {
        if (this.construction.status === Lifecycle.Status.Inactive) {
            this.construction.start();
        }

        if (this.construction.status === Lifecycle.Status.Initializing) {
            return this.construction.then(() => (super.act as any)(actorOrPurpose, actor));
        }

        return (super.act as any)(actorOrPurpose, actor);
    }

    get interaction(): Interactable<ActionContext> {
        if (this.#interaction === undefined) {
            if (this.#blockInteractions) {
                throw new ImplementationError("Cannot access interaction of a shutting-down node");
            }
            this.#interaction = new ClientNodeInteraction(this);
        }

        return this.#interaction;
    }

    get peerAddress(): PeerAddress | undefined {
        // Whenever the commissioning backing is loaded its state is authoritative - mirror it (set or cleared)
        // so the cache cannot survive a decommission as a stale value
        const state = this.behaviors.maybeStateOf("commissioning");
        if (state !== undefined) {
            const live = PeerAddress(state.peerAddress as PeerAddress | undefined);
            this.#cachedPeerAddress = live;
            return live;
        }

        if (this.#cachedPeerAddress !== undefined) {
            return this.#cachedPeerAddress;
        }

        // Backing not yet loaded; consult storage directly, tolerating teardown
        try {
            const stored = PeerAddress(this.store.storeForEndpoint(this).peerAddress as PeerAddress | undefined);
            if (stored !== undefined) {
                this.#cachedPeerAddress = stored;
                return stored;
            }
        } catch (error) {
            DependencyLifecycleError.accept(error);
            logger.info("Cannot resolve peer address from storage:", error);
        }

        return undefined;
    }

    override get identity() {
        const peerAddress = this.peerAddress;

        // Use the peer address as a log identifier if present
        if (peerAddress) {
            return PeerAddress(peerAddress).toString();
        }

        // Fall back to persistence ID
        return super.identity;
    }

    protected override statusUpdate(message: string): void {
        // Log client node status updates as info rather than notice and change the log facility to make clear it's a
        // client
        logger.info(Diagnostic.strong(this.toString()), message);
    }
}

export namespace ClientNode {
    export interface Options extends Node.Options<RootEndpoint> {
        matter?: MatterModel;
    }

    export const RootEndpoint = MutableEndpoint({
        ...Node.CommonRootEndpoint,
        deviceRevision: EndpointType.UNKNOWN_DEVICE_REVISION,
    }).with(CommissioningClient, NetworkClient);

    export interface RootEndpoint extends Identity<typeof RootEndpoint> {}
}

Object.freeze(ClientNode.RootEndpoint);
