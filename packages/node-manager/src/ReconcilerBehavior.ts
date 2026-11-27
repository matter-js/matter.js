/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ManagedFabric, managedFabricOf } from "#ManagedFabric.js";
import { executeActions, ReconcileTarget } from "#reconcile/executeActions.js";
import { BUILT_IN_KINDS } from "#reconcile/kinds.js";
import { PeerWiring } from "#reconcile/PeerWiring.js";
import { DriftDisposition, planActions, PlannedAction, VerifyResult } from "#reconcile/planActions.js";
import {
    Duration,
    ImplementationError,
    Logger,
    Minutes,
    Mutex,
    Observable,
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
    currentReapplies,
    ServerNode,
} from "@matter/node";
import { Fabric, FabricManager, SustainedSubscription } from "@matter/protocol";
import { FabricIndex, GlobalFabricId, Status } from "@matter/types";

const logger = Logger.get("Reconciler");

/** Whether a device status is worth trying again when the kind itself does not say. */
export function defaultRecoverable(code: number): boolean {
    return code === Status.Timeout || code === Status.Busy;
}

/**
 * Read the capacity of every kind that reports one, or of `only`, and hand each to `setCapacity`. Stops before the
 * next device read once `signal` is aborted.
 */
export async function refreshCapacities(
    node: ClientNode,
    registry: ItemKindRegistry,
    setCapacity: (kind: string, info: CapacityInfo) => void,
    signal: AbortSignal,
    only?: string,
): Promise<void> {
    for (const kind of registry.all()) {
        if (kind.capacity === undefined || (only !== undefined && kind.kind !== only)) {
            continue;
        }
        if (signal.aborted) {
            return;
        }
        try {
            setCapacity(kind.kind, await kind.capacity(node));
        } catch (e) {
            logger.warn(
                `Capacity refresh for "${kind.kind}" on ${node.id} failed; admission keeps its previous count:`,
                e,
            );
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

/**
 * Read every committed item live. Stops before the next device read once `signal` is aborted; items not read by
 * then are in none of the result's sets.
 */
export async function buildVerifyResult(
    node: ClientNode,
    items: readonly ManagedItem[],
    registry: ItemKindRegistry,
    signal: AbortSignal,
): Promise<VerifyResult> {
    const verified = new Set<string>();
    const drifted = new Set<string>();
    const unread = new Map<string, unknown>();
    for (const item of items) {
        if (item.status.state !== "committed") {
            continue;
        }
        const mapKey = itemMapKey(item.kind, item.key);
        const kind = registry.get(item.kind);
        if (kind?.verify === undefined) {
            continue;
        }
        if (signal.aborted) {
            break;
        }
        try {
            ((await kind.verify(node, item)) ? verified : drifted).add(mapKey);
        } catch (e) {
            unread.set(mapKey, e);
            logger.debug(`Verify of ${node.id} ${item.kind}:${item.key} failed, item left unread:`, e);
        }
    }
    return { verified, drifted, unread };
}

/** A run's gate resolves on an explicit pass; it must not take an unread item for a verified one. */
function throwFirstUnread(verifyResult: VerifyResult | undefined) {
    if (verifyResult !== undefined && verifyResult.unread.size > 0) {
        throw [...verifyResult.unread.values()][0];
    }
}

function driftNotice(peer: ClientNode, { kind, key, mode }: ManagedItem): string {
    return `Drift on ${peer.id} ${kind}:${key} (${mode}): changed on the device by another administrator of this fabric or by the device itself; ${mode === "maintain" ? "re-applying" : "left until a task gate or an explicit verify"}`;
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
        this.internal.peers = new Map();
        const fabrics = this.env.get(FabricManager);
        this.#settleFabric();
        this.reactTo(fabrics.events.added, this.#settleFabric);
        this.reactTo(fabrics.events.deleted, this.#fabricDeleted);
        // Naming a fabric is how an operator takes over from one that has left, and the fabric it names is
        // usually already here — so nothing else would announce that the answer has changed.
        this.reactTo(this.events.fabric$Changed, this.#settleFabric);

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
            this.internal.peers.get(peer)?.close();
            this.internal.peers.delete(peer);
            this.internal.pending.delete(peer);
        }
        logger.notice(
            `Reconciler no longer manages fabric ${GlobalFabricId.strOf(fabric.globalId)}: it was removed from this controller`,
        );
        this.events.managedFabricLost.emit(fabric.globalId);
        // A fabric an operator already named takes over from here, rather than at whatever event happens next.
        this.#settleFabric();
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
        // Asked for from initialization, from `peers.added` and from adopting a fabric. A second wiring would
        // replace the first without closing it, and its observers would go on firing with nothing to dispose them.
        if (this.internal.peers.has(peer)) {
            return;
        }
        const wiring = new PeerWiring();
        this.internal.peers.set(peer, wiring);
        const { observers } = wiring;

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
        const signal = this.#wiredSignal(peer);
        if (signal === undefined) {
            return;
        }
        if (pass.refreshCapacity) {
            await this.#refreshCapacity(peer, signal);
        }
        await this.#reconcileEndpoint(peer, signal, { verify: pass.verify, disposition: "record" });
    }

    async #unwirePeer(peer: ClientNode) {
        this.internal.peers.get(peer)?.close();
        this.internal.peers.delete(peer);
        await this.internal.locks.get(peer)?.close();
        // Re-delete after the close await in case anything scheduled into the closing window.
        this.internal.pending.delete(peer);
        this.internal.locks.delete(peer);
    }

    // Called between a device write and the status that write earns, so it may not throw: a failed refresh leaves
    // the previous count, which the device's refusal of a later write still backs.
    async #refreshCapacity(peer: ClientNode, signal: AbortSignal, only?: string) {
        const updates = new Array<[string, CapacityInfo]>();
        await refreshCapacities(peer, this.internal.registry, (kind, info) => updates.push([kind, info]), signal, only);
        if (updates.length === 0 || signal.aborted) {
            return;
        }
        try {
            await peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                for (const [kind, info] of updates) {
                    ds.setCapacity(kind, info);
                }
            });
        } catch (e) {
            logger.warn(`Cannot record capacity of ${peer.id}; admission keeps its previous count:`, e);
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

    /**
     * Run one reconcile pass for a peer of the managed fabric, serialized with the passes triggers schedule.
     *
     * With `verify`, every committed item is read live first, and a drifted item is written back whatever its mode:
     * a `converge` drift too, which a scheduled pass only records. Each write-back spends the item's re-apply budget
     * ({@link ReconcilerBehavior.State.driftBudget}) as any other re-apply does. An item whose budget is spent, or
     * that is already held, is marked `held` and not written; only {@link retry} starts its budget over. This is the
     * pass task gates call.
     *
     * Resolves without doing anything while no fabric is managed, including when the fabric leaves while the pass
     * waits for the peer's lock, and when the peer is unwired before or during the pass; a caller that needs a fresh
     * read must ask whether the fabric is still managed.
     *
     * @throws ImplementationError when the peer is not on the managed fabric
     * @throws the first live-read error of the pass, after the pass has applied what it could read, so a caller
     *   never takes an unread item for a verified one
     */
    async reconcile(peer: ClientNode, options?: { verify?: boolean }): Promise<void> {
        if (!this.#acceptsPassFor(peer, "reconcile")) {
            return;
        }
        logger.debug(`Reconcile ${peer.id}${options?.verify ? " (verify)" : ""}`);
        // Serialize on the peer's node-level mutex so an explicit reconcile never overlaps a triggered pass.
        const verifyResult = await this.#mutexFor(peer).produce(async () => {
            const signal = this.#stillManagedAfterWait(peer, "reconcile") ? this.#wiredSignal(peer) : undefined;
            return signal === undefined
                ? undefined
                : this.#reconcileEndpoint(peer, signal, { verify: options?.verify ?? false, disposition: "reapply" });
        });
        throwFirstUnread(verifyResult);
    }

    /**
     * Take an item out of `held`: run one verify pass for the peer, serialized with the passes triggers schedule, in
     * which the item may be written back whatever its hold and budget say. A successful live read of the item ends
     * its hold and starts its re-apply budget over; a drifted item is then written back, and that write is the first
     * spend. A failed read leaves hold and budget as they were. The peer's other items are handled as
     * `reconcile(peer, { verify: true })` handles them.
     *
     * Resolves without doing anything while no fabric is managed, including when the fabric leaves while the pass
     * waits for the peer's lock, and when the peer is unwired before or during the pass; a caller that needs a fresh
     * read must ask whether the fabric is still managed.
     *
     * @param kind the kind as the reconciler registered it — the instance, as a task names a kind, not its name
     * @throws ImplementationError when the peer is not on the managed fabric, when `kind` is not the registered
     *   instance, or when the peer holds no item `kind`:`key`
     * @throws the first live-read error of any item on the peer, as {@link reconcile} does — after the pass, so the
     *   retried item may already have been written back when it rejects
     */
    async retry(peer: ClientNode, kind: ItemKind, key: string): Promise<void> {
        if (!this.#acceptsPassFor(peer, "retry")) {
            return;
        }
        if (this.internal.registry.get(kind.kind) !== kind) {
            throw new ImplementationError(
                `Cannot retry ${kind.kind}:${key} on ${peer.id}: the kind passed is not the one the reconciler registered under that name`,
            );
        }
        if (peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind.kind, key)] === undefined) {
            throw new ImplementationError(
                `Cannot retry ${kind.kind}:${key} on ${peer.id}: the peer holds no such item`,
            );
        }
        logger.info(`Retrying ${peer.id} ${kind.kind}:${key}`);
        const verifyResult = await this.#mutexFor(peer).produce(async () => {
            const signal = this.#stillManagedAfterWait(peer, "retry") ? this.#wiredSignal(peer) : undefined;
            return signal === undefined
                ? undefined
                : this.#reconcileEndpoint(peer, signal, {
                      verify: true,
                      disposition: "reapply",
                      retrying: itemMapKey(kind.kind, key),
                  });
        });
        throwFirstUnread(verifyResult);
    }

    /**
     * The signal a pass for the peer runs under, taken once when the pass starts; `undefined` when the peer is not
     * wired, and the pass is then dropped.
     */
    #wiredSignal(peer: ClientNode): AbortSignal | undefined {
        const signal = this.internal.peers.get(peer)?.signal;
        if (signal === undefined || signal.aborted) {
            logger.debug(`Pass for ${peer.id} dropped: the peer is not wired`);
            return undefined;
        }
        return signal;
    }

    /**
     * Whether the peer is still managed once its lock is ours. The fabric may have left while the pass waited, and
     * the caller's fabric check ran before that, so this answers quietly.
     */
    #stillManagedAfterWait(peer: ClientNode, verb: string): boolean {
        if (this.#manages(peer)) {
            return true;
        }
        logger.debug(`Dropping ${verb} for ${peer.id}: its fabric is no longer managed`);
        return false;
    }

    /**
     * Whether an explicit pass for the peer goes ahead: false while no fabric is managed, which is not a caller's
     * mistake — a pass already under way when the fabric went has nothing left to do, and a run's gate asks for one
     * while it settles.
     *
     * @throws ImplementationError when the peer is not on the managed fabric
     */
    #acceptsPassFor(peer: ClientNode, verb: string): boolean {
        const fabric = this.internal.fabric;
        if (fabric === undefined) {
            logger.debug(`Not running ${verb} for ${peer.id}: ${this.internal.unmanagedReason}`);
            return false;
        }
        if (!fabric.owns(peer.peerAddress)) {
            throw new ImplementationError(
                `Cannot ${verb} ${peer.id}: it is not on the fabric this manager manages (index ${fabric.index})`,
            );
        }
        return true;
    }

    registerItemKind(kind: ItemKind): void {
        this.internal.registry.register(kind);
    }

    itemKind(kind: string): ItemKind | undefined {
        return this.internal.registry.get(kind);
    }

    async #runExecutor(
        peer: ClientNode,
        planned: PlannedAction[],
        registry: ItemKindRegistry,
        signal: AbortSignal,
    ): Promise<void> {
        const target: ReconcileTarget = {
            node: peer,
            signal,
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
            refreshCapacity: kind => this.#refreshCapacity(peer, signal, kind),
        };
        await executeActions(target, planned, registry);
    }

    /**
     * One pass for the peer. Resolves `undefined` — nothing read, nothing to reject with — when `signal` is aborted at
     * any point, so a caller never acts on a pass for a peer that is no longer wired.
     */
    async #reconcileEndpoint(
        peer: ClientNode,
        signal: AbortSignal,
        options: {
            verify: boolean;
            disposition: DriftDisposition;
            /** The {@link itemMapKey} of an item {@link retry} may write back whatever its hold and budget say. */
            retrying?: string;
        },
    ): Promise<VerifyResult | undefined> {
        const items = Object.values(peer.stateOf(DesiredStateBehavior).items);

        const result = options.verify
            ? await buildVerifyResult(peer, items, this.internal.registry, signal)
            : undefined;
        if (signal.aborted) {
            logger.debug(`Pass for ${peer.id} discarded: the peer was unwired while its live read was out`);
            return undefined;
        }

        const planned = planActions(items, {
            verify:
                result === undefined
                    ? undefined
                    : {
                          result,
                          disposition: options.disposition,
                          canReapply: item =>
                              itemMapKey(item.kind, item.key) === options.retrying || this.#canReapply(peer, item),
                      },
            recoverable: item =>
                this.internal.registry.get(item.kind)?.recoverable?.(item.status.failureCode ?? 0) ??
                defaultRecoverable(item.status.failureCode ?? 0),
        });

        if (result !== undefined) {
            await this.#recordDrift(peer, planned, result, options.retrying);
        }

        await this.#runExecutor(peer, planned, this.internal.registry, signal);
        if (signal.aborted) {
            logger.debug(`Pass for ${peer.id} discarded: the peer was unwired while it wrote`);
            return undefined;
        }
        return result;
    }

    /** A held item stays held, whatever its budget says, until an action ends the hold. */
    #canReapply(peer: ClientNode, item: ManagedItem): boolean {
        const enforcement = peer.stateOf(DesiredStateBehavior).enforcement[itemMapKey(item.kind, item.key)];
        return (
            enforcement?.held !== true &&
            currentReapplies(enforcement) < this.endpoint.stateOf(ReconcilerBehavior).driftBudget.count
        );
    }

    /**
     * Write what a verify pass found into the items' enforcement records: observed drift, holds, and a re-apply for
     * every item written back. A successful read of the item a {@link retry} names ends its hold first.
     *
     * The observed drift of an item being re-applied is not cleared here: the status write of a successful apply
     * clears it.
     */
    async #recordDrift(
        peer: ClientNode,
        planned: readonly PlannedAction[],
        verifyResult: VerifyResult,
        retrying: string | undefined,
    ): Promise<void> {
        const { window } = this.endpoint.stateOf(ReconcilerBehavior).driftBudget;
        await peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            for (const { item, action, drift } of planned) {
                const { kind, key, mode, generation } = item;
                const mapKey = itemMapKey(kind, key);
                const verified = verifyResult.verified.has(mapKey);
                if (!verified && !verifyResult.drifted.has(mapKey)) {
                    continue;
                }

                if (mapKey === retrying) {
                    ds.releaseHold(kind, key, generation);
                }
                const previous = ds.enforcementOf(kind, key);

                if (verified) {
                    if (previous?.drift !== undefined) {
                        ds.clearDrift(kind, key);
                        logger.debug(`Drift on ${peer.id} ${kind}:${key} ended: the device holds the item again`);
                    }
                    continue;
                }

                if (action === "apply") {
                    const firstInWindow = currentReapplies(previous) === 0;
                    if (!ds.recordReapply(kind, key, window, generation)) {
                        logger.debug(
                            `Drift on ${peer.id} ${kind}:${key} not counted: the item changed during the read`,
                        );
                        continue;
                    }
                    if (mode !== "maintain") {
                        logger.debug(`Drift on ${peer.id} ${kind}:${key} (${mode}): re-applying on an explicit verify`);
                    } else if (firstInWindow) {
                        logger.notice(driftNotice(peer, item));
                    } else {
                        logger.debug(`Drift on ${peer.id} ${kind}:${key} (${mode}) again: re-applying`);
                    }
                    continue;
                }

                if (action !== "drifted" || drift === undefined) {
                    continue;
                }
                // The generation guards against an item rewritten while the read was out; its record is new.
                if (drift === "held") {
                    ds.hold(kind, key, generation);
                } else {
                    ds.markDrift(kind, key, generation);
                }
                const now = ds.enforcementOf(kind, key);
                if (now?.drift === undefined) {
                    logger.debug(`Drift on ${peer.id} ${kind}:${key} not recorded: the item changed during the read`);
                } else if (drift === "held" && previous?.held !== true) {
                    logger.warn(
                        `Drift on ${peer.id} ${kind}:${key} (${mode}) held: ${currentReapplies(now)} re-applies still count against its budget and it changed again, so it is not written back any more. It needs an action: ReconcilerBehavior.retry(), removing the intent, or writing a new intent`,
                    );
                } else if (drift === "recorded" && previous?.drift === undefined) {
                    logger.notice(driftNotice(peer, item));
                } else {
                    logger.debug(`Drift on ${peer.id} ${kind}:${key} (${mode}) confirmed again; still ${drift}`);
                }
            }
        });
    }

    override async [Symbol.asyncDispose]() {
        this.internal.disposed = true;
        this.internal.settleTimer?.stop();
        this.internal.sweepTimer?.stop();
        for (const wiring of this.internal.peers.values()) {
            wiring.close();
        }
        this.internal.peers.clear();
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
         * How often a drifted item is re-applied: at most `count` times within `window`, counting every re-apply —
         * scheduled passes, explicit verifies and task gates alike. The next drift after that holds the item, and it
         * stays held until {@link ReconcilerBehavior.retry}, a removed intent or a new one. The re-applies are
         * recorded in the item's `ItemEnforcement`, so they live as long as the item.
         *
         * A changed `count` applies at once. A changed `window` applies to re-applies made afterwards: each counts for
         * the window in force when it was made.
         */
        driftBudget: { count: number; window: Duration } = { count: 3, window: Minutes(10) };

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
        /** What is kept for each wired peer, whatever its fabric; see {@link PeerWiring}. */
        peers!: Map<ClientNode, PeerWiring>;
        sweepTimer?: Timer;
        settleTimer?: Timer;
        locks = new Map<ClientNode, Mutex>();
        /** The reconcile pass each peer has coming, coalesced. Dropped with the peer, so it cannot outlive it. */
        pending = new Map<ClientNode, PendingPass>();
        disposed = false;
    }

    export class Events extends Behavior.Events {
        /** An operator named a different fabric to manage; see {@link State.fabric}. */
        fabric$Changed = new Observable<[value: FabricIndex | undefined, oldValue: FabricIndex | undefined]>();

        /**
         * A fabric is managed from now on.
         *
         * What was deferred for want of one — a resume pass, a departed-peer sweep — happens on this.
         */
        managedFabricAdopted = Observable<[globalId: GlobalFabricId]>();

        /**
         * The managed fabric left the controller, so nothing of it can be reached again.
         *
         * For an application that holds work of its own against those peers. The task layer ends its own runs of
         * that fabric from the fabric table, not from this event, so a fabric removed while another is managed
         * is settled too.
         */
        managedFabricLost = Observable<[globalId: GlobalFabricId]>();
    }
}

export type { ItemKind };
