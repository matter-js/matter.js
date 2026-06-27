/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { asError, Logger, ObserverGroup } from "@matter/general";
import { ClientNode, DesiredStateBehavior, itemMapKey, ItemMode, ManagedItem, NetworkClient } from "@matter/node";
import { SustainedSubscription } from "@matter/protocol";
import { Task } from "./Task.js";
import { TaskPeerUnavailableError } from "./errors.js";
import { TaskContext, TaskState } from "./types.js";

const logger = Logger.get("TaskContext");

/**
 * Lets the manager interrupt a parked gate. `aborted()` returns the abort reason (a cancel or suspend signal)
 * once set; the gate then rejects with it. `onAbort` wakes the gate so it observes the abort even while parked
 * on peer observers.
 */
export interface GateControl {
    aborted(): unknown;
    onAbort(wake: () => void): () => void;
}

/**
 * TaskContext bound to a running task. Records pre-mutation state into the task's changeSet so cancel can revert.
 * Peers are resolved through an injected resolver so the manager controls peer lookup.
 */
export class RunningTaskContext implements TaskContext {
    constructor(
        protected readonly task: Task,
        protected readonly peerResolver: (peerId: string) => ClientNode | undefined,
        protected readonly reconciler: ReconcilerBehavior,
        protected readonly setState: (state: TaskState) => void,
        protected readonly gate?: GateControl,
    ) {}

    resolvePeer(peerId: string): ClientNode {
        const peer = this.peerResolver(peerId);
        if (peer === undefined) {
            throw new TaskPeerUnavailableError(`Task ${this.task.id}: peer "${peerId}" is not available`);
        }
        return peer;
    }

    tryResolvePeer(peerId: string): ClientNode | undefined {
        return this.peerResolver(peerId);
    }

    async setIntent(peer: ClientNode, kind: string, key: string, intent: unknown, mode: ItemMode = "converge") {
        this.#record(peer, kind, key);
        await peer.act(agent => {
            agent.get(DesiredStateBehavior).setIntent(kind, key, intent, mode);
        });
    }

    async removeIntent(peer: ClientNode, kind: string, key: string) {
        this.#record(peer, kind, key);
        await peer.act(agent => {
            agent.get(DesiredStateBehavior).removeIntent(kind, key);
        });
    }

    // First touch wins: records the pre-task state so a revert restores that, not an intermediate touch.
    #record(peer: ClientNode, kind: string, key: string) {
        if (this.task.changeSet.some(e => e.peerId === peer.id && e.kind === kind && e.key === key)) {
            return;
        }
        const existing = peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind, key)];
        const prior = existing === undefined ? undefined : { intent: existing.intent, mode: existing.mode };
        this.task.changeSet.push({ peerId: peer.id, kind, key, prior });
    }

    async removeIntentIfUnreferenced(peer: ClientNode, kind: string, key: string): Promise<boolean> {
        if (this.reconciler.itemKind(kind)?.isReferenced?.(peer, key)) {
            logger.debug(`Task ${this.task.id}: keep ${kind}:${key} on ${peer.id} (still referenced)`);
            return false;
        }
        await this.removeIntent(peer, kind, key);
        return true;
    }

    async awaitCommitted(items: Array<{ peer: ClientNode; kind: string; key: string }>): Promise<void> {
        const peers = [...new Set(items.map(i => i.peer))];
        await this.awaitGate(peers, () => items.every(i => this.#itemState(i.peer, i.kind, i.key) === "committed"));
    }

    /**
     * Suspend until `until` holds over the peers' desired-state items, re-evaluated by verify-reconcile.
     * Watches each peer's `itemChanged` + subscription status via a per-gate {@link ObserverGroup} (NOT
     * `reactTo`, which is same-node only). While any peer is unreachable the task parks; it runs otherwise.
     */
    async awaitGate(nodes: ClientNode[], until: (items: ManagedItem[]) => boolean): Promise<void> {
        const aborted = this.gate?.aborted();
        if (aborted !== undefined) {
            throw asError(aborted);
        }
        if (await this.#evaluate(nodes, until)) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const observers = new ObserverGroup();
            let unregisterAbort: (() => void) | undefined;
            let settled = false;
            const finish = (err?: unknown) => {
                if (settled) {
                    // A reconcile that rejects from an already-coalesced recheck after the gate settled
                    // still represents a real failure; surface it rather than dropping it silently.
                    if (err !== undefined) {
                        logger.warn(`Task ${this.task.id}: ignoring late gate-evaluation error after settle:`, err);
                    }
                    return;
                }
                settled = true;
                observers.close();
                unregisterAbort?.();
                if (err !== undefined) {
                    reject(asError(err));
                } else {
                    resolve();
                }
            };

            // Coalesce overlapping rechecks: an event during an in-flight evaluate sets a pending flag so a
            // single follow-up evaluation runs afterward instead of stacking reconciles on the peer mutexes.
            let evaluating = false;
            let pending = false;
            const recheck = () => {
                const aborted = this.gate?.aborted();
                if (aborted !== undefined) {
                    finish(aborted);
                    return;
                }
                this.#classify(nodes);
                if (evaluating) {
                    pending = true;
                    return;
                }
                evaluating = true;
                const drain = (): void => {
                    this.#evaluate(nodes, until).then(done => {
                        if (done) {
                            finish();
                            return;
                        }
                        if (pending) {
                            pending = false;
                            drain();
                            return;
                        }
                        evaluating = false;
                    }, finish);
                };
                drain();
            };

            for (const node of nodes) {
                observers.on(node.eventsOf(DesiredStateBehavior).itemChanged, recheck);
                observers.on(node.eventsOf(NetworkClient).subscriptionStatusChanged, recheck);
            }
            unregisterAbort = this.gate?.onAbort(recheck);

            // An abort raised during the initial #evaluate await fired its wake before onAbort registered;
            // re-check so that abort is not lost while the gate parks on (possibly silent) peer observers.
            const lateAbort = this.gate?.aborted();
            if (lateAbort !== undefined) {
                finish(lateAbort);
                return;
            }

            this.#classify(nodes);
        });

        this.setState("running");
    }

    async #evaluate(nodes: ClientNode[], until: (items: ManagedItem[]) => boolean): Promise<boolean> {
        // Reconcile is not reachability-guarded and would throw on an unreachable peer. Skip it for such peers
        // so the gate parks (predicate left unsatisfied) and waits for the reachability-change wake.
        for (const node of nodes) {
            if (this.#reachable(node)) {
                await this.reconciler.reconcile(node, { verify: true });
            }
        }
        const items = nodes.flatMap(node => Object.values(node.stateOf(DesiredStateBehavior).items));
        return until(items);
    }

    #classify(nodes: ClientNode[]) {
        this.setState(nodes.some(node => !this.#reachable(node)) ? "parked" : "running");
    }

    #itemState(peer: ClientNode, kind: string, key: string) {
        return peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind, key)]?.status.state;
    }

    // Mirrors ReconcilerBehavior#reachable: the same NetworkClient subscription state is the single source of truth.
    #reachable(node: ClientNode): boolean {
        if (!node.behaviors.has(NetworkClient)) {
            return false;
        }
        if (node.stateOf(NetworkClient).isDisabled) {
            return false;
        }
        const sub = node.behaviors.internalsOf(NetworkClient).activeSubscription;
        if (sub === undefined) {
            return false;
        }
        return sub instanceof SustainedSubscription ? sub.active.value : true;
    }
}
