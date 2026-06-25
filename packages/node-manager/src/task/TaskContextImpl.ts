/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { asError, Logger, ObserverGroup } from "@matter/general";
import {
    ClientNode,
    DesiredStateBehavior,
    itemMapKey,
    ItemMode,
    ManagedItem,
    NetworkClient,
    ServerNode,
} from "@matter/node";
import { SustainedSubscription } from "@matter/protocol";
import { Task } from "./Task.js";
import { TaskPeerUnavailableError } from "./errors.js";
import { TaskContext, TaskState } from "./types.js";

const logger = Logger.get("TaskContext");

/**
 * TaskContext bound to a running task + the root node. Records created items into the task's addLog
 * so cancel can revert them.
 */
export class TaskContextImpl implements TaskContext {
    constructor(
        protected readonly task: Task,
        protected readonly rootNode: ServerNode,
        protected readonly reconciler: ReconcilerBehavior,
        protected readonly setState: (state: TaskState) => void,
    ) {}

    resolvePeer(peerId: string): ClientNode {
        const peer = this.rootNode.peers.get(peerId);
        if (peer === undefined) {
            throw new TaskPeerUnavailableError(`Task ${this.task.id}: peer "${peerId}" is not available`);
        }
        return peer;
    }

    async setIntent(peer: ClientNode, kind: string, key: string, intent: unknown, mode: ItemMode = "converge") {
        await peer.act(agent => {
            agent.get(DesiredStateBehavior).setIntent(kind, key, intent, mode);
        });
        if (!this.task.addLog.some(e => e.peerId === peer.id && e.kind === kind && e.key === key)) {
            this.task.addLog.push({ peerId: peer.id, kind, key });
        }
    }

    async removeIntent(peer: ClientNode, kind: string, key: string) {
        await peer.act(agent => {
            agent.get(DesiredStateBehavior).removeIntent(kind, key);
        });
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
        if (await this.#evaluate(nodes, until)) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const observers = new ObserverGroup();
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

            this.#classify(nodes);
        });

        this.setState("running");
    }

    async #evaluate(nodes: ClientNode[], until: (items: ManagedItem[]) => boolean): Promise<boolean> {
        for (const node of nodes) {
            await this.reconciler.reconcile(node, { verify: true });
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
