/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AclItemKind } from "#reconcile/AclItemKind.js";
import { BindingItemKind } from "#reconcile/BindingItemKind.js";
import { GroupKeyItemKind } from "#reconcile/GroupKeyItemKind.js";
import { GroupKeyMapItemKind } from "#reconcile/GroupKeyMapItemKind.js";
import { GroupMembershipItemKind } from "#reconcile/GroupMembershipItemKind.js";
import { executeActions, ReconcileTarget } from "#reconcile/executeActions.js";
import { planActions, PlannedAction, VerifyResult } from "#reconcile/planActions.js";
import { Duration, Logger, Minutes, Mutex, ObserverGroup, Seconds, Time, Timer } from "@matter/general";
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
import { SustainedSubscription } from "@matter/protocol";
import { Status } from "@matter/types";

const logger = Logger.get("Reconciler");

function defaultRecoverable(code: number): boolean {
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

    declare readonly state: ReconcilerBehavior.State;
    declare internal: ReconcilerBehavior.Internal;
    declare readonly events: ReconcilerBehavior.Events;

    get #rootNode(): ServerNode {
        return Node.forEndpoint(this.endpoint) as ServerNode;
    }

    override async initialize() {
        this.internal.registry.register(new GroupKeyItemKind());
        this.internal.registry.register(new GroupKeyMapItemKind());
        this.internal.registry.register(new GroupMembershipItemKind());
        this.internal.registry.register(new AclItemKind());
        this.internal.registry.register(new BindingItemKind());
        this.internal.peerObservers = new Map();

        this.internal.settleTimer = Time.getTimer(
            "reconciler settle",
            this.state.settleDelay,
            this.callback(this.#afterSettle),
        ).start();

        this.reactTo(this.#rootNode.peers.added, this.#wirePeer);
        this.reactTo(this.#rootNode.peers.deleted, this.#unwirePeer);

        for (const peer of this.#rootNode.peers) {
            this.#wirePeer(peer);
        }
    }

    async #afterSettle() {
        if (this.internal.disposed) {
            return;
        }
        logger.debug("Reconciler settle elapsed, starting first pass");
        for (const peer of this.#rootNode.peers) {
            if (this.#reachable(peer)) {
                await this.reconcile(peer);
            }
        }
        if (!shouldStartSweep(this.internal)) {
            return;
        }
        this.internal.sweepTimer = Time.getPeriodicTimer(
            "reconciler sweep",
            this.state.sweepInterval,
            this.callback(this.#sweep),
        ).start();
    }

    async #sweep() {
        for (const peer of this.#rootNode.peers) {
            if (this.#reachable(peer) && Object.keys(peer.stateOf(DesiredStateBehavior).items).length > 0) {
                await this.reconcile(peer, { verify: false });
            }
        }
    }

    #wirePeer(peer: ClientNode) {
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
            updateStatus(kind, key, state, code) {
                return Promise.resolve(
                    peer.act(agent => agent.get(DesiredStateBehavior).updateStatus(kind, key, state, code)),
                );
            },
            dropItem(kind, key) {
                return Promise.resolve(peer.act(agent => agent.get(DesiredStateBehavior).dropItem(kind, key)));
            },
            currentState(kind, key) {
                return peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind, key)]?.status.state;
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
    }

    export class Internal {
        registry = new ItemKindRegistry();
        peerObservers!: Map<ClientNode, ObserverGroup>;
        sweepTimer?: Timer;
        settleTimer?: Timer;
        locks = new Map<ClientNode, Mutex>();
        pending = new Map<ClientNode, PendingPass>();
        disposed = false;
    }

    export class Events extends Behavior.Events {}
}

export type { ItemKind };
