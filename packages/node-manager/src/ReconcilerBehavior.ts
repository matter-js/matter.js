/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AclItemKind } from "#reconcile/AclItemKind.js";
import { executeActions, ReconcileTarget } from "#reconcile/executeActions.js";
import { planActions, PlannedAction, VerifyResult } from "#reconcile/planActions.js";
import { Duration, Logger, Minutes, ObserverGroup, Seconds, Time, Timer } from "@matter/general";
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

// Transient JFDS status codes that should be retried rather than permanently dropped.
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

/** Serializes reconcile passes per peer and coalesces re-entries into a single follow-up pass. */
export class InFlightGuard {
    #running = false;
    #dirty = false;

    async run(pass: () => Promise<void>): Promise<void> {
        if (this.#running) {
            this.#dirty = true;
            return;
        }
        this.#running = true;
        try {
            do {
                this.#dirty = false;
                await pass();
            } while (this.#dirty);
        } finally {
            this.#running = false;
        }
    }
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

    declare readonly state: ReconcilerBehavior.State;
    declare internal: ReconcilerBehavior.Internal;
    declare readonly events: ReconcilerBehavior.Events;

    get #rootNode(): ServerNode {
        return Node.forEndpoint(this.endpoint) as ServerNode;
    }

    override async initialize() {
        this.internal.registry.register(new AclItemKind());
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
                void this.#onReachable(peer);
            }
        });

        observers.on(peer.eventsOf(DesiredStateBehavior).itemChanged, () => {
            if (this.#reachable(peer)) {
                void this.reconcile(peer);
            }
        });

        observers.on(peer.lifecycle.softwareVersionChanged, () => {
            if (this.#reachable(peer)) {
                void this.#onReachable(peer);
            }
        });
    }

    #unwirePeer(peer: ClientNode) {
        const observers = this.internal.peerObservers.get(peer);
        if (observers !== undefined) {
            observers.close();
            this.internal.peerObservers.delete(peer);
        }
        this.internal.guards.delete(peer);
    }

    async #onReachable(peer: ClientNode) {
        await this.#refreshCapacity(peer);
        await this.reconcile(peer, { verify: true });
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
        let guard = this.internal.guards.get(peer);
        if (guard === undefined) {
            guard = new InFlightGuard();
            this.internal.guards.set(peer, guard);
        }
        await guard.run(() => this.#reconcileEndpoint(peer, options));
    }

    registerItemKind(kind: ItemKind): void {
        this.internal.registry.register(kind);
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
        guards = new Map<ClientNode, InFlightGuard>();
        disposed = false;
    }

    export class Events extends Behavior.Events {}
}

export type { ItemKind };
