/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AclItemKind } from "#reconcile/AclItemKind.js";
import { executeActions, ReconcileTarget } from "#reconcile/executeActions.js";
import { planActions, PlannedAction, VerifyResult } from "#reconcile/planActions.js";
import { Duration, Minutes, ObserverGroup, Seconds, Time, Timer } from "@matter/general";
import {
    Behavior,
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

// Transient JFDS status codes that should be retried rather than permanently dropped.
function defaultRecoverable(code: number): boolean {
    return code === Status.Timeout || code === Status.Busy;
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
        for (const peer of this.#rootNode.peers) {
            if (this.#reachable(peer)) {
                await this.reconcile(peer);
            }
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
    }

    async #onReachable(peer: ClientNode) {
        await this.#refreshCapacity(peer);
        await this.reconcile(peer, { verify: true });
    }

    async #refreshCapacity(peer: ClientNode) {
        for (const kind of this.internal.registry.all()) {
            if (kind.capacity !== undefined) {
                const info = await kind.capacity(peer);
                await peer.act(agent => agent.get(DesiredStateBehavior).setCapacity(kind.kind, info));
            }
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
        if (this.internal.inFlight.has(peer)) {
            return;
        }
        this.internal.inFlight.add(peer);
        try {
            await this.#reconcileEndpoint(peer, options);
        } finally {
            this.internal.inFlight.delete(peer);
        }
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
        inFlight = new Set<ClientNode>();
    }

    export class Events extends Behavior.Events {}
}

export type { ItemKind };
