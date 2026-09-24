/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ManagedFabric, managedFabricOf } from "#ManagedFabric.js";
import { executeActions, ReconcileTarget } from "#reconcile/executeActions.js";
import { BUILT_IN_KINDS } from "#reconcile/kinds.js";
import { planActions, PlannedAction, VerifyResult } from "#reconcile/planActions.js";
import {
    Duration,
    ImplementationError,
    Logger,
    Minutes,
    Mutex,
    Observable,
    ObserverGroup,
    Seconds,
    Time,
    Timer,
} from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import {
    Behavior,
    CapacityInfo,
    ClientNode,
    DesiredStateBehavior,
    ItemKind,
    ItemKindRegistry,
    itemMapKey,
    ManagedItem,
    NetworkClient,
    Node,
    ServerNode,
} from "@matter/node";
import { Fabric, FabricManager, SustainedSubscription } from "@matter/protocol";
import { FabricIndex, GlobalFabricId, Status } from "@matter/types";

const logger = Logger.get("Reconciler");

/** Whether a device status is worth trying again when the kind itself does not say. */
export function defaultRecoverable(code: number): boolean {
    return code === Status.Timeout || code === Status.Busy;
}

export async function refreshCapacities(
    node: ClientNode,
    registry: ItemKindRegistry,
    setCapacity: (kind: string, info: CapacityInfo) => void,
): Promise<void> {
    for (const kind of registry.all()) {
        if (kind.capacity === undefined) {
            continue;
        }
        try {
            setCapacity(kind.kind, await kind.capacity(node));
        } catch (e) {
            logger.notice(`Capacity refresh for "${kind.kind}" failed, skipping:`, e);
        }
    }
}

/** A coalesced reconcile request for a peer. `verify`/`refreshCapacity` OR-merge across requests. */
interface PendingPass {
    verify: boolean;
    refreshCapacity: boolean;
}

export function shouldStartSweep(internal: { disposed: boolean }): boolean {
    return !internal.disposed;
}

export async function buildVerifyResult(
    node: ClientNode,
    items: readonly ManagedItem[],
    registry: ItemKindRegistry,
): Promise<VerifyResult> {
    const driftedKeys = new Set<string>();
    for (const item of items) {
        if (item.status.state !== "committed") {
            continue;
        }
        const kind = registry.get(item.kind);
        if (kind?.verify === undefined) {
            continue;
        }
        if (!(await kind.verify(node, item))) {
            driftedKeys.add(itemMapKey(item.kind, item.key));
        }
    }
    return { driftedKeys };
}

export class ReconcilerBehavior extends Behavior {
    static override readonly id = "reconciler";
    static override readonly early = true;

    /**
     * Only `managedFabricId` persists: which fabric this manager adopted is the one thing a later start cannot
     * work out again, because a fabric index is recyclable and the configured index may name another fabric by
     * then. Nonvolatile state records what a transaction changed, so the member has to carry the quality.
     */
    static override readonly schema = new DatatypeModel({
        name: "Reconciler",
        type: "struct",
        children: [FieldElement({ name: "managedFabricId", type: "string", quality: "NX", default: null })],
    });

    declare readonly state: ReconcilerBehavior.State;
    declare internal: ReconcilerBehavior.Internal;
    declare readonly events: ReconcilerBehavior.Events;

    get #rootNode(): ServerNode {
        return Node.forEndpoint(this.endpoint) as ServerNode;
    }

    /** The fabric this manager manages, once one is settled. */
    get managedFabric(): ManagedFabric | undefined {
        return this.internal.fabric;
    }

    /** Why no fabric is settled, for the refusal a caller receives. */
    get unmanagedReason(): string | undefined {
        return this.internal.unmanagedReason;
    }

    override async initialize() {
        for (const kind of BUILT_IN_KINDS) {
            this.internal.registry.register(kind);
        }
        this.internal.peerObservers = new Map();
        const fabrics = this.env.get(FabricManager);
        this.#settleFabric();
        this.reactTo(fabrics.events.added, this.#settleFabric);
        this.reactTo(fabrics.events.deleted, this.#fabricDeleted);

        this.internal.settleTimer = Time.getTimer(
            "reconciler settle",
            this.state.settleDelay,
            this.callback(this.#afterSettle),
        ).start();

        // Wired for every peer, whatever fabric it is on: a node being commissioned has no address yet, so
        // there is nothing to judge it by. `#schedule` is the gate that keeps work to the managed fabric.
        // A peer appearing is also the moment a fabric this manager was waiting for may have arrived without
        // an event of its own, which a fabric table built without storage never emits.
        this.reactTo(this.#rootNode.peers.added, this.#peerAdded);
        this.reactTo(this.#rootNode.peers.deleted, this.#unwirePeer);

        for (const peer of this.#rootNode.peers) {
            this.#wirePeer(peer);
        }
    }

    #peerAdded(peer: ClientNode) {
        this.#wirePeer(peer);
        if (this.internal.fabric === undefined) {
            this.#settleFabric();
        }
    }

    /**
     * Settle which fabric this manager manages.
     *
     * The identity it stored wins: it names the fabric whose peers its records and desired-state items already
     * describe, and a configured index that now names a different fabric is a mistake, not an instruction. With
     * nothing stored, an explicitly configured index is taken, and a controller holding exactly one fabric needs
     * no configuration at all. Anything else stays unmanaged until an operator says which.
     *
     * Idempotent, and safe to call again whenever the answer may have changed: nothing here unbinds a fabric
     * this manager already holds.
     */
    #settleFabric(): void {
        if (this.internal.fabric !== undefined) {
            return;
        }
        const fabrics = this.env.get(FabricManager);
        const stored = this.state.managedFabricId;
        if (stored !== null && stored !== undefined) {
            const fabric = fabrics.maybeFor(GlobalFabricId(stored));
            if (fabric === undefined) {
                // Gone while this process was not running, so no removal event will ever say so. An operator
                // naming another fabric is how that is recovered from; without a name, the identity stays,
                // because adopting whatever fabric is present would drive this fabric's records against it.
                const configured = this.state.fabric;
                if (configured === undefined) {
                    this.#stayUnmanaged(
                        `the fabric it manages (${GlobalFabricId.strOf(GlobalFabricId(stored))}) is not on this controller, and no other fabric is named`,
                    );
                    return;
                }
                const named = fabrics.maybeFor(configured);
                if (named === undefined) {
                    this.#stayUnmanaged(`no fabric holds the configured index ${configured}`);
                } else {
                    logger.warn(
                        `Reconciler takes up fabric ${GlobalFabricId.strOf(named.globalId)} (index ${configured}): the fabric it managed (${GlobalFabricId.strOf(GlobalFabricId(stored))}) is no longer on this controller`,
                    );
                    this.#bind(named);
                }
            } else if (!this.#configuredIndexAgrees(fabric)) {
                this.#stayUnmanaged(
                    `it manages fabric ${GlobalFabricId.strOf(fabric.globalId)}, which is index ${fabric.fabricIndex}, but is configured for index ${this.state.fabric}`,
                );
            } else {
                this.#bind(fabric);
            }
            return;
        }
        const configured = this.state.fabric;
        if (configured !== undefined) {
            const fabric = fabrics.maybeFor(configured);
            if (fabric === undefined) {
                this.#stayUnmanaged(`no fabric holds the configured index ${configured}`);
            } else {
                this.#bind(fabric);
            }
            return;
        }
        // One fabric and no configuration is the ordinary controller, and its one fabric is what its work is
        // about. Several are ambiguous, and guessing would bind desired state and records to a fabric an
        // operator never named.
        switch (fabrics.length) {
            case 0:
                this.#stayUnmanaged("this controller holds no fabric yet");
                break;
            case 1:
                this.#bind(fabrics.fabrics[0]);
                break;
            default:
                this.#stayUnmanaged(
                    `this controller holds ${fabrics.length} fabrics (${fabrics.fabrics
                        .map(f => f.fabricIndex)
                        .join(", ")}) and none is configured`,
                );
        }
    }

    #configuredIndexAgrees(fabric: Fabric): boolean {
        const configured = this.state.fabric;
        return configured === undefined || configured === fabric.fabricIndex;
    }

    /**
     * Take up a fabric: remember it, record it for the next start, and resume the work that belongs to it.
     *
     * Wiring and the sweep are part of binding, not of startup: a manager that adopts a fabric later — or again
     * after losing one — would otherwise report itself managing while no trigger and no sweep ever reach a peer.
     */
    #bind(fabric: Fabric): void {
        this.internal.fabric = managedFabricOf(this.#rootNode, fabric.fabricIndex, fabric.globalId);
        this.internal.unmanagedReason = undefined;
        this.state.managedFabricId = String(fabric.globalId);
        logger.info(`Reconciler manages fabric ${GlobalFabricId.strOf(fabric.globalId)} (index ${fabric.fabricIndex})`);
        this.events.managedFabricAdopted.emit(fabric.globalId);
        for (const peer of this.internal.fabric.peers()) {
            this.#wirePeer(peer);
            if (this.#reachable(peer)) {
                this.#schedule(peer, { verify: true, refreshCapacity: true });
            }
        }
        this.#startSweep();
    }

    /**
     * Give up the fabric, for a reason a caller can act on.
     *
     * The stored identity stays, whatever the reason. A manager that forgot which fabric its records and
     * desired state describe would adopt whichever fabric is present — and the fabric table drops a fabric
     * before it announces the removal, so "one fabric left and nothing stored" is exactly the state a deletion
     * would leave behind. Taking up another fabric is an operator's decision, made by naming its index.
     */
    #stayUnmanaged(reason: string): void {
        this.internal.unmanagedReason = reason;
    }

    #fabricDeleted(fabric: Fabric): void {
        if (this.internal.fabric?.globalId !== fabric.globalId) {
            return;
        }
        // The peers stay in the container — nothing erases a client node when the fabric beneath it goes — so
        // they have to stop being managed here, and whoever holds work for them has to be told.
        //
        // Nothing is awaited: this runs inside the fabric's own removal, and draining a peer's in-flight pass
        // would hold that removal for as long as the device takes to answer, or fail it outright.
        const peers = this.internal.fabric.peers();
        this.internal.fabric = undefined;
        this.#stayUnmanaged(
            `the fabric it managed (${GlobalFabricId.strOf(fabric.globalId)}) was removed from this controller`,
        );
        this.internal.sweepTimer?.stop();
        this.internal.sweepTimer = undefined;
        for (const peer of peers) {
            this.internal.peerObservers.get(peer)?.close();
            this.internal.peerObservers.delete(peer);
            this.internal.pending.delete(peer);
        }
        logger.notice(
            `Reconciler no longer manages fabric ${GlobalFabricId.strOf(fabric.globalId)}: it was removed from this controller`,
        );
        this.events.managedFabricLost.emit(fabric.globalId);
    }

    #startSweep(): void {
        if (this.internal.sweepTimer !== undefined || !shouldStartSweep(this.internal)) {
            return;
        }
        this.internal.sweepTimer = Time.getPeriodicTimer(
            "reconciler sweep",
            this.state.sweepInterval,
            this.callback(this.#sweep),
        ).start();
    }

    async #afterSettle() {
        if (this.internal.disposed) {
            return;
        }
        logger.debug("Reconciler settle elapsed, starting first pass");
        for (const peer of this.#managedPeers()) {
            if (this.#reachable(peer)) {
                await this.reconcile(peer);
            }
        }
        this.#startSweep();
    }

    async #sweep() {
        for (const peer of this.#managedPeers()) {
            if (this.#reachable(peer) && Object.keys(peer.stateOf(DesiredStateBehavior).items).length > 0) {
                await this.reconcile(peer, { verify: false });
            }
        }
    }

    #wirePeer(peer: ClientNode) {
        // Asked for from initialization, from `peers.added` and from adopting a fabric. A second group would
        // replace the first without closing it, and its observers would go on firing with nothing to dispose
        // them.
        if (this.internal.peerObservers.has(peer)) {
            return;
        }
        const observers = new ObserverGroup();
        this.internal.peerObservers.set(peer, observers);

        observers.on(peer.eventsOf(NetworkClient).subscriptionStatusChanged, (isActive: boolean) => {
            if (isActive) {
                this.#schedule(peer, { verify: true, refreshCapacity: true });
            }
        });

        observers.on(peer.eventsOf(DesiredStateBehavior).itemChanged, () => {
            if (this.#reachable(peer)) {
                this.#schedule(peer, { verify: false, refreshCapacity: false });
            }
        });

        observers.on(peer.lifecycle.softwareVersionChanged, () => {
            if (this.#reachable(peer)) {
                this.#schedule(peer, { verify: true, refreshCapacity: true });
            }
        });
    }

    /** The peers of the managed fabric, or none while no fabric is managed. */
    #managedPeers(): ClientNode[] {
        return this.internal.fabric?.peers() ?? new Array<ClientNode>();
    }

    #manages(peer: ClientNode): boolean {
        return this.internal.fabric?.owns(peer.peerAddress) === true;
    }

    #mutexFor(peer: ClientNode): Mutex {
        let mutex = this.internal.locks.get(peer);
        if (mutex === undefined) {
            mutex = new Mutex(this);
            this.internal.locks.set(peer, mutex);
        }
        return mutex;
    }

    // Synchronous: triggers enqueue a coalesced reconcile request on the peer's node-level mutex. A request
    // arriving while a pass runs merges into one follow-up pass. The mutex owns and serializes the work and
    // logs task rejections, so nothing is voided or swallowed silently.
    #schedule(peer: ClientNode, pass: PendingPass) {
        // The gate for every trigger: a peer is wired as soon as it appears, because a node being commissioned
        // has no address yet and so no fabric to judge it by, and it is only worked on once it turns out to be
        // one of ours.
        if (!this.#manages(peer)) {
            return;
        }
        const pending = this.internal.pending.get(peer);
        if (pending !== undefined) {
            pending.verify ||= pass.verify;
            pending.refreshCapacity ||= pass.refreshCapacity;
            return;
        }
        this.internal.pending.set(peer, { ...pass });
        this.#mutexFor(peer).run(() => this.#drainPending(peer));
    }

    async #drainPending(peer: ClientNode) {
        const pass = this.internal.pending.get(peer);
        this.internal.pending.delete(peer);
        if (pass === undefined) {
            return;
        }
        if (pass.refreshCapacity) {
            await this.#refreshCapacity(peer);
        }
        await this.#reconcileEndpoint(peer, { verify: pass.verify });
    }

    async #unwirePeer(peer: ClientNode) {
        const observers = this.internal.peerObservers.get(peer);
        if (observers !== undefined) {
            observers.close();
            this.internal.peerObservers.delete(peer);
        }
        await this.internal.locks.get(peer)?.close();
        // Re-delete after the close await in case anything scheduled into the closing window.
        this.internal.pending.delete(peer);
        this.internal.locks.delete(peer);
    }

    async #refreshCapacity(peer: ClientNode) {
        const updates = new Array<[string, CapacityInfo]>();
        await refreshCapacities(peer, this.internal.registry, (kind, info) => updates.push([kind, info]));
        if (updates.length > 0) {
            await peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                for (const [kind, info] of updates) {
                    ds.setCapacity(kind, info);
                }
            });
        }
    }

    #reachable(peer: ClientNode): boolean {
        if (!peer.behaviors.has(NetworkClient)) {
            return false;
        }
        if (peer.stateOf(NetworkClient).isDisabled) {
            return false;
        }
        const sub = peer.behaviors.internalsOf(NetworkClient).activeSubscription;
        if (sub === undefined) {
            return false;
        }
        // SustainedSubscription reports active only after the subscription is established, not just created.
        return sub instanceof SustainedSubscription ? sub.active.value : true;
    }

    async reconcile(peer: ClientNode, options?: { verify?: boolean }): Promise<void> {
        const fabric = this.internal.fabric;
        if (fabric === undefined) {
            // Not a caller's mistake: a pass already under way when the fabric went has nothing left to do, and
            // a run's gate asks for this pass while it settles.
            logger.debug(`Not reconciling ${peer.id}: ${this.internal.unmanagedReason}`);
            return;
        }
        if (!fabric.owns(peer.peerAddress)) {
            throw new ImplementationError(
                `Cannot reconcile ${peer.id}: it is not on the fabric this manager manages (index ${fabric.index})`,
            );
        }
        logger.debug(`Reconcile ${peer.id}${options?.verify ? " (verify)" : ""}`);
        // Serialize on the peer's node-level mutex so an explicit reconcile never overlaps a triggered pass.
        await this.#mutexFor(peer).produce(() => this.#reconcileEndpoint(peer, options));
    }

    registerItemKind(kind: ItemKind): void {
        this.internal.registry.register(kind);
    }

    itemKind(kind: string): ItemKind | undefined {
        return this.internal.registry.get(kind);
    }

    async #runExecutor(peer: ClientNode, planned: PlannedAction[], registry: ItemKindRegistry): Promise<void> {
        const target: ReconcileTarget = {
            node: peer,
            updateStatus(kind, key, state, code, ifGeneration) {
                return Promise.resolve(
                    peer.act(agent =>
                        agent.get(DesiredStateBehavior).updateStatus(kind, key, state, code, ifGeneration),
                    ),
                );
            },
            dropItem: (kind, key, ifGeneration) => {
                return Promise.resolve(
                    peer.act(agent => agent.get(DesiredStateBehavior).dropItem(kind, key, ifGeneration)),
                );
            },
            currentItem(kind, key) {
                return peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind, key)];
            },
        };
        await executeActions(target, planned, registry);
    }

    async #reconcileEndpoint(peer: ClientNode, options?: { verify?: boolean }): Promise<void> {
        const verify = options?.verify ?? false;
        const items = Object.values(peer.stateOf(DesiredStateBehavior).items);

        const verifyResult = verify ? await buildVerifyResult(peer, items, this.internal.registry) : undefined;

        const planned = planActions(items, {
            verify,
            verifyResult,
            recoverable: item =>
                this.internal.registry.get(item.kind)?.recoverable?.(item.status.failureCode ?? 0) ??
                defaultRecoverable(item.status.failureCode ?? 0),
        });

        await this.#runExecutor(peer, planned, this.internal.registry);
    }

    override async [Symbol.asyncDispose]() {
        this.internal.disposed = true;
        this.internal.settleTimer?.stop();
        this.internal.sweepTimer?.stop();
        for (const observers of this.internal.peerObservers.values()) {
            observers.close();
        }
        this.internal.peerObservers.clear();
        this.internal.pending.clear();
        await Promise.all([...this.internal.locks.values()].map(mutex => mutex.close()));
        this.internal.locks.clear();
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace ReconcilerBehavior {
    export class State {
        settleDelay: Duration = Seconds(5);
        sweepInterval: Duration = Minutes(5);

        /**
         * The fabric to manage, where a controller holds more than one. Policy a deployment sets, so it is not
         * persisted; what the manager adopted is.
         */
        fabric?: FabricIndex = undefined;

        /** The adopted fabric's {@link GlobalFabricId}, as a decimal string. Written when it is adopted. */
        managedFabricId: string | null = null;
    }

    export class Internal {
        registry = new ItemKindRegistry();
        fabric?: ManagedFabric;
        /** Why {@link fabric} is unset, for a refusal that has no agent to ask. */
        unmanagedReason?: string;
        peerObservers!: Map<ClientNode, ObserverGroup>;
        sweepTimer?: Timer;
        settleTimer?: Timer;
        locks = new Map<ClientNode, Mutex>();
        /** The reconcile pass each peer has coming, coalesced. Dropped with the peer, so it cannot outlive it. */
        pending = new Map<ClientNode, PendingPass>();
        disposed = false;
    }

    export class Events extends Behavior.Events {
        /**
         * A fabric is managed from now on.
         *
         * What was deferred for want of one — a resume pass, a departed-peer sweep — happens on this.
         */
        managedFabricAdopted = Observable<[globalId: GlobalFabricId]>();

        /**
         * The managed fabric left the controller, so nothing of it can be reached again.
         *
         * For an application that holds work of its own against those peers: the task layer parks instead,
         * because a run's records outlive the fabric and ending them is not settled.
         */
        managedFabricLost = Observable<[globalId: GlobalFabricId]>();
    }
}

export type { ItemKind };
