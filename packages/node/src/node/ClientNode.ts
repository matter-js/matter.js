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
import { NetworkServer } from "#behavior/system/network/NetworkServer.js";
import { Agent } from "#endpoint/Agent.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { ClientNodeEndpoints } from "#endpoint/properties/ClientNodeEndpoints.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { awaitLifecycleOperation } from "#endpoint/properties/LifecycleMutex.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { ClientNodeStore } from "#storage/client/ClientNodeStore.js";
import type { ClientNodeStores } from "#storage/client/ClientNodeStores.js";
import { RemoteWriter } from "#storage/client/RemoteWriter.js";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import { StoreClosedError } from "#storage/StoreLifecycle.js";
import {
    Diagnostic,
    Duration,
    Identity,
    ImplementationError,
    Instant,
    InternalError,
    Lifecycle,
    Logger,
    MatterAggregateError,
    MatterError,
    MaybePromise,
    StorageManager,
} from "@matter/general";
import { Matter, MatterModel } from "@matter/model";
import { Interactable, OccurrenceManager, PeerAddress, PeerSet } from "@matter/protocol";
import { ClientEndpointInitializer } from "./client/ClientEndpointInitializer.js";
import { ClientNodeInteraction } from "./client/ClientNodeInteraction.js";
import { ClientStructure } from "./client/ClientStructure.js";
import { ClientNodeLifecycle } from "./ClientNodeLifecycle.js";
import { Node } from "./Node.js";
import type { ServerNode } from "./ServerNode.js";

const logger = Logger.get("ClientNode");

/**
 * Thrown when a {@link ClientNode} that is not commissioned is asked to go online.
 */
export class NodeUncommissionedError extends MatterError {}

/**
 * Thrown when a {@link ClientNode} is asked to go online while its server node is offline.
 */
export class ServerNodeOfflineError extends MatterError {}

/**
 * Thrown when a disabled {@link ClientNode} is asked to go online.  {@link ClientNode.enable} lifts this.
 */
export class NodeDisabledError extends MatterError {}

/**
 * A remote Matter {@link Node}.
 *
 * Client nodes may be peers (commissioned into a shared fabric) or commissionable, in which they are not usable until
 * you invoke {@link commissioned}.
 *
 * A node's `id` names it locally and may be reissued after the node is removed. Persist a {@link PeerAddress} when you
 * need to refer to the same logical fabric/node identity across local restarts. That address names one device for as
 * long as the device stays commissioned. Once the node is removed the address may be handed to another
 * device — `ControllerBehavior.allocatePeerAddress` documents when — so a reference kept for longer must cope
 * both with finding nothing and with finding someone else.
 */
export class ClientNode extends Node<ClientNode.RootEndpoint> {
    #matter?: MatterModel;
    #interaction?: ClientNodeInteraction;
    #blockInteractions = false;
    #cachedPeerAddress?: PeerAddress;
    #stores?: ClientNodeStores;

    constructor(options: ClientNode.Options) {
        const opts = {
            ...options,
            number: 0,

            // Create an unfrozen type so we can set the revision when we see the descriptor
            type: MutableEndpoint(ClientNode.RootEndpoint),
        };

        super(opts);

        // Block the OccurrenceManager from the parent environment so we don't attempt to record events from peers.
        // Deleting blocks it; closing would close the parent's manager
        this.env.delete(OccurrenceManager);

        this.env.set(Node, this);
        this.env.set(ClientNode, this);

        this.#matter = options.matter;
    }

    override readonly nodeType: "client" | "group" = "client";

    /**
     * Model of Matter semantics understood by this node.
     *
     * Matter elements missing from this model will not support all functionality.
     */
    override get matter(): MatterModel {
        return this.#matter ?? this.env.maybeGet(MatterModel) ?? Matter;
    }

    override get lifecycle(): ClientNodeLifecycle {
        return super.lifecycle as ClientNodeLifecycle;
    }

    override get endpoints(): ClientNodeEndpoints {
        return new ClientNodeEndpoints(this);
    }

    /**
     * Get the store of the node from {@link stores}, and open one if there is none.
     */
    protected openStore(stores: ClientNodeStores): ClientNodeStore {
        return stores.storeForNode(this);
    }

    /**
     * The current store of the node, or undefined if there is none.  Never opens a store, so a node whose store is
     * erased does not open another.
     */
    get #ownStore(): ClientNodeStore | undefined {
        return this.#stores?.storeOf(this.id);
    }

    // This needs to be sync to ensure a sync initialization
    override initialize() {
        // Kept, as the server node refuses access to the collection once its storage closes
        this.#stores = this.env.get(ServerNodeStore).clientStores;
        const store = this.openStore(this.#stores);

        const initializer = new ClientEndpointInitializer(this, store);
        this.env.set(EndpointInitializer, initializer);
        this.env.set(ClientStructure, initializer.structure);

        store.write = RemoteWriter(this, initializer.structure);

        this.lifecycle.seedIntent({ isDisabled: store.isNodeDisabled });

        this.#installCacheBuffer(store);

        initializer.structure.loadCache(store.endpointStores);

        const promise = super.initialize();

        if (store.isPreexisting && promise !== undefined) {
            // We initialize ClientNodes on-demand but want them fully initialized for immediate use.  This means
            // initialization must be synchronous.  Enforce this here to ensure we don't accidentally break this
            // contract.  A behavior that fails to load also yields a promise, so adopt its rejection rather than
            // discarding it; otherwise the real cause escapes as an unhandled rejection behind this diagnostic
            return promise.then(() => {
                throw new InternalError("Unsupported async initialization detected when loading known peer");
            });
        }

        return promise;
    }

    /**
     * Give {@link store} the buffer of the owning server node, unless the store has its own.  The first node creates
     * the buffer with the configured flush interval, which defaults to the
     * {@link StorageDriver#writeCoalescingInterval} of the storage driver.
     */
    #installCacheBuffer(store: ClientNodeStore) {
        if (store.buffer !== undefined) {
            return;
        }

        const parentEnv = this.owner.env;
        if (!parentEnv.has(ClientCacheBuffer)) {
            const driver = parentEnv.get(StorageManager).driver;
            const flushInterval =
                this.owner.stateOf(NetworkServer).clientCacheFlushInterval ?? driver.writeCoalescingInterval;
            parentEnv.set(ClientCacheBuffer, new ClientCacheBuffer(driver, flushInterval ?? Instant));
        }
        store.buffer = parentEnv.get(ClientCacheBuffer);
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
     * {@link owner} throws {@link InternalError} once the node is destroyed; a gone node rejects with its lifecycle
     * error instead.
     */
    get #peers() {
        this.lifecycle.assertNotGone();
        return this.owner.peers;
    }

    /**
     * Add this node to a fabric.
     *
     * Rejects as `Peers.runCommissioning()` describes if the node is gone or a commission or decommission of it is
     * already in progress.
     */
    async commission(options: CommissioningClient.CommissioningOptions) {
        await this.#peers.runCommissioning(this, () =>
            this.act("commission", agent => agent.commissioning.commission(options)),
        );
    }

    /**
     * Remove this node from the fabric (if commissioned) and locally.
     * This method tries to communicate with the device to decommission it properly and will fail if the device is
     * unreachable.  If the device does not confirm the removal, the node is kept and stays usable.  Rejects as
     * `Peers.runDecommissioning()` describes if the node is gone or a commission or decommission of it is already in
     * progress.
     * If you cannot reach the device, use {@link delete} instead.
     */
    async decommission() {
        await this.#peers.runDecommissioning(this, async () => {
            if (this.lifecycle.isCommissioned) {
                this.statusUpdate("decommissioning");

                await this.act("decommission", agent => agent.commissioning.decommission());
            }

            await this.deleteDespiteServerTeardown();
        });
    }

    /**
     * Open a Basic Commissioning Window on this peer (uses the passcode originally printed on the device).
     *
     * This is an optional feature and not all devices support it; use {@link openEnhancedCommissioningWindow} unless
     * you specifically need the basic commissioning method.
     */
    async openBasicCommissioningWindow(commissioningTimeout?: Duration) {
        await this.act(agent => agent.commissioning.openBasicCommissioningWindow(commissioningTimeout));
    }

    /**
     * Open an Enhanced Commissioning Window on this peer using a freshly generated random passcode.
     *
     * @returns the pairing codes and the values they encode.
     */
    async openEnhancedCommissioningWindow(commissioningTimeout?: Duration) {
        return await this.act(agent => agent.commissioning.openEnhancedCommissioningWindow(commissioningTimeout));
    }

    /**
     * Force-remove the node without first decommissioning.
     *
     * If the node is still available, you should use {@link decommission} to remove it properly from the fabric and
     * only use this method as fallback.  You should inform the user that manual factory-reset may be necessary.  A
     * delete while another delete of the node is in progress joins it.  Throws `DestroyedDependencyError` once a close
     * of the node, or a close or delete of its server node, was requested.  A close of the server node closes the node
     * and keeps its storage; a delete of the server node removes it.
     */
    override delete() {
        return super.delete();
    }

    /**
     * Remove the node for a removal that reflects fabric membership or the erase of the server node: a
     * {@link decommission}, a fabric Leave, `Peers.erase()`, `MatterController.removeNode()`, the cleanup after a
     * failed CommissioningComplete and the cull of expired commissionable nodes.  Such a removal must land even while
     * the server node closes, or the node is restored on its next start, so unlike {@link delete} this is not refused
     * once a close or delete of the server node was requested.
     *
     * For a node whose own close or delete is in progress, this waits for that to end, then erases the storage of the
     * node and removes its protocol peer.  The erase counts as requested at once, so a close of the stores of the
     * server node waits for it; once that close began, the node still closes and the call then rejects with
     * `DestroyedDependencyError`, as its storage is not erased.  A node erases its storage once at most, as a later node
     * may receive the same ID.
     *
     * @internal
     */
    async deleteDespiteServerTeardown() {
        if (!this.lifecycle.isTerminal) {
            return this.deleteDespiteOwnerTeardown();
        }
        const address = this.peerAddress;
        try {
            const close = () => this.close();
            const stores = this.#forgetStores();
            await (stores === undefined ? close() : stores.eraseStore(this.id, close));
        } finally {
            await this.#forgetProtocolPeer(address);
        }
    }

    protected override async deleteWithMutex(prepared: (erasure: EndpointInitializer.Erasure) => void) {
        const address = this.peerAddress;

        try {
            await super.deleteWithMutex(prepared);
        } finally {
            await this.#forgetProtocolPeer(address);
        }
    }

    /**
     * Ensure there is no remaining @matter/protocol Peer installed, which a close keeps.  This must hold even when
     * teardown fails or the peer outlives its fabric.
     */
    async #forgetProtocolPeer(address: PeerAddress | undefined) {
        if (address !== undefined) {
            await this.env.maybeGet(PeerSet)?.get(address)?.delete();
        }
    }

    /**
     * Erase the data cached from the peer and initialize the node again if it was started.  Commissioning and
     * connection settings stay.  If its network was running it reconnects and reads the peer again.
     *
     * Rejects with a {@link MatterAggregateError} if a step fails.  A failed reset still erases the cache and
     * initializes the node again.  The node crashes if it cannot disconnect first, in which case nothing is erased, if
     * the cache erase fails, or if it cannot reconnect for another reason than its server node being offline.  If
     * its server node is offline by then, the node stays offline instead.  Throws `DestroyedDependencyError` once a
     * close or delete of the node or of its server node was requested.
     */
    override erase() {
        return super.erase();
    }

    /**
     * Bring the node online, and its server node first if that is offline and the node is commissioned.
     *
     * Calls of {@link start}, {@link stop}, {@link enable} and {@link disable} take effect as `Node.start()` describes.
     * Their directions:
     *
     * | call         | direction            | reversed by a later          |
     * |--------------|----------------------|------------------------------|
     * | `start()`    | online               | `stop()`, `disable()`        |
     * | `stop()`     | offline              | `start()`, `enable()`        |
     * | `enable()`   | online and enabled   | `stop()`, `disable()`        |
     * | `disable()`  | offline and disabled | `enable()`                   |
     *
     * The server node stays online if the start of this node fails, and also if a later {@link stop} reverses this
     * start while it starts the server node.  Throws `DestroyedDependencyError` if the node or its server node is
     * closing or closed, also when a verb of its server node removes the node while this waits for the server node.
     * Otherwise throws `NodeDisabledError` at once for a disabled node, and the error of the {@link onlineBlocker} if
     * the node may not go online at its turn.
     */
    override async start() {
        if (this.lifecycle.isDisabled && this.terminalCause === undefined) {
            throw this.#disabledError();
        }
        await super.start();
    }

    /**
     * Start the server node if it is offline and nothing of the node itself keeps the node offline.  The server node
     * mutex comes before the peer node mutex: the server node waits for its peers while it holds its mutex, and it may
     * hold its mutex while it starts this node, so this only queues on it while the server node is offline.  A node
     * that its own blocker keeps offline rejects at its turn, after an {@link enable} persisted the flag.
     */
    protected override async prepareStart() {
        if (this.#ownBlocker === undefined && !this.owner.lifecycle.isOnline) {
            await this.owner.start();
        }
    }

    /**
     * The server node of a peer destroys the peer once the close or delete of the server node was requested.
     */
    protected override get terminalAncestor(): Endpoint | undefined {
        const owner = super.owner;
        return owner?.lifecycle.isTerminal ? owner : undefined;
    }

    /**
     * A peer stays offline while it is disabled or not commissioned, and while its server node is offline.  A requested
     * close or delete of the peer or of its server node blocks first, so a closing disabled peer reports its close.
     *
     * @internal
     */
    override get onlineBlocker(): Node.OnlineBlocker | undefined {
        const blocker = this.#ownBlocker;
        if (blocker !== undefined) {
            return blocker;
        }
        const server = this.owner;
        if (!server.lifecycle.isOnline) {
            return {
                error: () => new ServerNodeOfflineError(`Cannot interact with ${this} because ${server} is offline`),
            };
        }
    }

    /**
     * What of the node itself keeps it offline: a requested close or delete, the disabled flag, or a missing
     * commissioning.
     */
    get #ownBlocker(): Node.OnlineBlocker | undefined {
        const blocker = super.onlineBlocker;
        if (blocker !== undefined) {
            return blocker;
        }
        if (this.lifecycle.isDisabled) {
            return { error: () => this.#disabledError() };
        }
        if (!this.lifecycle.isCommissioned) {
            return {
                error: () => new NodeUncommissionedError(`Cannot interact with ${this} because it is uncommissioned`),
            };
        }
    }

    #disabledError() {
        return new NodeDisabledError(`Cannot interact with ${this} because it is disabled`);
    }

    /**
     * Whether the node is disabled.  {@link disable} sets this at once and {@link enable} clears it, so it reflects the
     * last of these calls even while the call waits for its turn.  If that call fails, this returns to the persisted
     * flag.  A disabled node stays offline, also after a restart, until it is enabled.  Before the node is initialized
     * it is not disabled.
     */
    get isDisabled(): boolean {
        return this.lifecycle.isDisabled;
    }

    /**
     * Disable the node.
     *
     * This shuts down any active connections and prevents future connections until re-enabled.  The node goes offline
     * before it persists the flag.  Calls take effect as {@link start} describes.  A disable that a later
     * {@link enable} reverses keeps nothing; one that a later {@link stop} follows applies at its turn.  A failed
     * disable leaves the node offline, and disabled only if it persisted the flag.  A crashed node persists the flag
     * too.  Throws `DestroyedDependencyError` if the node or its server node is closing or closed.
     */
    async disable() {
        const change: ClientNode.TargetChange = {
            target: "offline",
            isDisabled: true,
            policy: "refused-once-terminal",
            action: "disable",
            operation: "disabling",
        };
        await this.changeTarget(change);
    }

    /**
     * Enable the node and bring it online like {@link start}.
     *
     * The node persists the flag before it goes online.  Calls take effect as {@link start} describes.  An enable that
     * a later {@link stop} reverses still clears the flag, which that stop persists.  A failed enable leaves the node
     * enabled only if it persisted the flag.  A crashed node persists the flag and then rejects, as it cannot go
     * online.  Throws `DestroyedDependencyError` if the node or its server node is closing or closed.
     */
    async enable() {
        const change: ClientNode.TargetChange = {
            target: "online",
            isDisabled: false,
            policy: "refused-once-terminal",
            action: "enable",
            operation: "enabling",
        };
        await this.changeTarget(change);
    }

    /**
     * Apply a write of the deprecated `NetworkClient` state field `isDisabled` with the meaning the field had.  True
     * disables the node like {@link disable}.  False clears the flag and keeps the target, so the node goes online only
     * by a later {@link start} or by the auto-start of its server node.  Throws like {@link disable}.
     *
     * @internal
     */
    async applyDisabledWrite(isDisabled: boolean) {
        if (isDisabled) {
            await this.disable();
            return;
        }
        const change: ClientNode.TargetChange = {
            target: this.lifecycle.intent.target,
            isDisabled: false,
            keepsTarget: true,
            policy: "refused-once-terminal",
            action: "clear the disabled flag",
            operation: "clearing the disabled flag of",
        };
        await this.changeTarget(change);
    }

    protected override recordIntent(change: ClientNode.TargetChange) {
        return this.lifecycle.recordIntent(
            {
                target: change.target,
                isDisabled: change.isDisabled ?? this.lifecycle.isDisabled,
            },
            { keepsTarget: change.keepsTarget },
        );
    }

    protected override isInDirectionOf(intent: ClientNodeLifecycle.Intent, change: ClientNode.TargetChange) {
        return (
            super.isInDirectionOf(intent, change) &&
            (change.isDisabled === undefined || change.isDisabled === intent.isDisabled)
        );
    }

    protected override async persistIntentWithMutex() {
        const store = this.#ownStore;
        if (store === undefined) {
            throw new StoreClosedError(`Cannot persist the disabled flag of ${this} because it has no store`);
        }
        await store.recordNodeDisabled(this.lifecycle.isDisabled);
    }

    /**
     * A node without a loaded store is not disabled.
     */
    protected override get appliedIntent(): ClientNodeLifecycle.Intent {
        return { ...super.appliedIntent, isDisabled: this.#ownStore?.isNodeDisabled ?? false };
    }

    /**
     * Delete erases the store of the node itself, also when the node crashed before it installed its initializer.
     */
    protected override async prepareDelete(): Promise<EndpointInitializer.Erasure> {
        return { wipe: async () => this.#forgetStores()?.eraseStore(this.id) };
    }

    /**
     * Erase drops what the node cached from the peer and keeps its commissioning and connection settings.
     */
    protected override async prepareErase(): Promise<EndpointInitializer.Erasure> {
        return {
            wipe: async () => this.#stores?.eraseCaches(this.id),
        };
    }

    /**
     * Drop the collection of the node for an erase of its store.  A removed node then never erases again, as a later
     * node may receive the same ID.
     */
    #forgetStores() {
        const stores = this.#stores;
        this.#stores = undefined;
        return stores;
    }

    protected override async resetWithMutex() {
        this.#cachedPeerAddress = undefined;
        await super.resetWithMutex();
    }

    protected override createLifecycle(): ClientNodeLifecycle {
        return new ClientNodeLifecycle(this);
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
            await MatterAggregateError.settleSeries(
                [() => interaction?.close(), () => super.cancelWithMutex()],
                `Error disconnecting ${this}`,
            );
        } finally {
            this.#blockInteractions = false;
        }
    }

    // A peer belongs to its host's Peers, which closes it within the host's teardown
    protected override get isRuntimeWorker() {
        return false;
    }

    protected override get container() {
        return this.owner?.peers;
    }

    override act<R>(
        purpose: string,
        actor: (agent: Agent.Instance<ClientNode.RootEndpoint>) => MaybePromise<R>,
        options?: Endpoint.ActOptions,
    ): MaybePromise<R>;

    override act<R>(actor: (agent: Agent.Instance<ClientNode.RootEndpoint>) => MaybePromise<R>): MaybePromise<R>;

    override act<R>(
        actorOrPurpose: string | ((agent: Agent.Instance<ClientNode.RootEndpoint>) => MaybePromise<R>),
        actor?: (agent: Agent.Instance<ClientNode.RootEndpoint>) => MaybePromise<R>,
        options?: Endpoint.ActOptions,
    ): MaybePromise<R> {
        const act = (): MaybePromise<R> => (super.act as any)(actorOrPurpose, actor, options);
        const ready = this.#readyToAct();
        return ready === undefined ? act() : ready.then(act);
    }

    /**
     * Start an inactive node so it can act.  Returns a promise if the node is not ready yet.  A node that is closing or
     * being deleted must not come back.  While a lifecycle verb is in progress the node waits for it, whatever its
     * outcome, and checks again, as an erase restarts a started node itself.
     */
    #readyToAct(): Promise<void> | undefined {
        if (this.construction.status === Lifecycle.Status.Inactive) {
            this.lifecycle.assertNotGone();

            const operation = this.lifecycleOperation;
            if (operation !== undefined) {
                return awaitLifecycleOperation(`acting on ${this}`, `a lifecycle operation of ${this}`, operation).then(
                    () => this.#readyToAct(),
                    () => this.#readyToAct(),
                );
            }

            this.construction.start();
        }

        if (this.construction.status === Lifecycle.Status.Initializing) {
            return this.construction.then(() => {});
        }
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

        // Backing not yet loaded; consult the store
        const stored = PeerAddress(this.#ownStore?.peerAddress as PeerAddress | undefined);
        if (stored !== undefined) {
            this.#cachedPeerAddress = stored;
        }
        return stored;
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

    /**
     * A call of `changeTarget()` of a client node.
     */
    export interface TargetChange extends Node.TargetChange {
        /**
         * Whether the node is disabled, or undefined if the call keeps it as it is.
         */
        isDisabled?: boolean;

        /**
         * True if the call asks for no target and keeps the one of the intent, so the auto-start of the server node may
         * still give the node an online intent.
         */
        keepsTarget?: boolean;
    }

    export const RootEndpoint = MutableEndpoint({
        ...Node.CommonRootEndpoint,
        deviceRevision: EndpointType.UNKNOWN_DEVICE_REVISION,
    }).with(CommissioningClient, NetworkClient);

    export interface RootEndpoint extends Identity<typeof RootEndpoint> {}
}

Object.freeze(ClientNode.RootEndpoint);
