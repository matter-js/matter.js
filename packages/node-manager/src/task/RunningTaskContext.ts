/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerSurface } from "#reconcile/ReconcilerSurface.js";
import { asError, Logger, ObserverGroup } from "@matter/general";
import {
    ClientNode,
    DesiredStateBehavior,
    ItemConclusion,
    ItemKind,
    itemMapKey,
    ItemMode,
    ManagedItem,
    NetworkClient,
} from "@matter/node";
import { PeerAddress, SustainedSubscription } from "@matter/protocol";
import { TaskFailedError, TaskPeerUnavailableError } from "./errors.js";
import { addressLabel, addressOf, peerLabel } from "./peer.js";
import { runLabel, RunRecord, TaskPersistence } from "./Task.js";
import { TaskContext, TaskState } from "./types.js";

const logger = Logger.get("TaskContext");

/**
 * Lets the manager interrupt a parked gate. `aborted()` returns the abort reason (a cancel, abandon or suspend signal)
 * once set; the gate then rejects with it. `onAbort` wakes the gate so it observes the abort even while parked
 * on peer observers.
 */
export interface GateControl {
    aborted(): unknown;
    onAbort(wake: () => void): () => void;
}

/**
 * TaskContext bound to a running task. Records pre-mutation state into the task's changeSet so cancel can rollback.
 * Peers are resolved through an injected resolver so the manager controls peer lookup.
 */
export class RunningTaskContext implements TaskContext {
    constructor(
        protected readonly record: RunRecord,
        protected readonly peerResolver: (peer: PeerAddress) => ClientNode | undefined,
        protected readonly reconciler: ReconcilerSurface,
        protected readonly setState: (state: TaskState) => void,
        protected readonly gate?: GateControl,
        protected readonly peerLister: () => ClientNode[] = () => new Array<ClientNode>(),
        protected readonly persistChanges: (next: Partial<TaskPersistence>) => Promise<void> = async next =>
            record.adopt(next),
    ) {}

    resolvePeer(address: PeerAddress): ClientNode {
        const peer = this.peerResolver(address);
        if (peer === undefined) {
            throw new TaskPeerUnavailableError(
                `Task ${runLabel(this.record.runId)}: peer ${addressLabel(address)} is not available`,
            );
        }
        return peer;
    }

    tryResolvePeer(address: PeerAddress): ClientNode | undefined {
        return this.peerResolver(address);
    }

    async setIntent<I>(peer: ClientNode, kind: ItemKind<I>, key: string, intent: I, mode: ItemMode = "converge") {
        this.#requireRegistered(kind);
        await this.#record(peer, kind.kind, key);
        await peer.act(agent => {
            agent.get(DesiredStateBehavior).setIntent(kind.kind, key, intent, mode);
        });
    }

    async removeIntent(peer: ClientNode, kind: ItemKind, key: string): Promise<boolean> {
        this.#requireRegistered(kind);
        // Before the removal is issued, or a conclusion reached before a gate starts is missed and the gate
        // has only the item's absence to read — which is what a removal and an abandonment look like alike.
        this.#watchConclusions(peer);
        // Nothing to remove is nothing changed: `DesiredStateBehavior.removeIntent` is a no-op for an item that
        // is not there, and recording it would give the run a change set entry that restores nothing and a
        // claim that it altered a device. The caller is told so, because an item that was never there will
        // never conclude and nothing should wait for it to.
        if (peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind.kind, key)] === undefined) {
            return false;
        }
        await this.#record(peer, kind.kind, key);
        await peer.act(agent => {
            agent.get(DesiredStateBehavior).removeIntent(kind.kind, key);
        });
        return true;
    }

    intentOf<I>(peer: ClientNode, kind: ItemKind<I>, key: string): I | undefined {
        this.#requireRegistered(kind);
        // The kind names the intent type, so no caller has to assert one.
        return peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind.kind, key)]?.intent as I | undefined;
    }

    kindNamed(name: string): ItemKind {
        const kind = this.reconciler.itemKind(name);
        if (kind === undefined) {
            throw new TaskFailedError(
                `Task ${runLabel(this.record.runId)}: no item kind "${name}" is registered, so a change naming it cannot be applied`,
            );
        }
        return kind;
    }

    /**
     * The reconciler's own kind for the reference a task passed, asked for by every verb that takes one.
     *
     * The instance, not merely the name. {@link ItemKind} is structural and generic in its intent type, so a
     * lookalike carrying a registered name type-checks a task's intent against *its* type while the registered
     * kind goes on to read that value as its own — the intent reaches the device shaped for a kind nobody
     * registered. A name the reconciler does not own is the same hazard one step earlier: the intent never
     * converges and the task parks on its own gate with nothing to say why.
     */
    #requireRegistered(kind: ItemKind): ItemKind {
        const registered = this.kindNamed(kind.kind);
        if (registered !== kind) {
            throw new TaskFailedError(
                `Task ${runLabel(this.record.runId)}: item kind "${kind.kind}" is not the one the reconciler registered under that name`,
            );
        }
        return registered;
    }

    /**
     * Record the pre-task state of an item, first touch winning so a rollback restores that rather than an
     * intermediate one.
     *
     * The record carries it before the caller changes the device, and the run adopts it only once that write
     * has landed. A restart re-drives a phase from its start, and an item the device already holds reads back
     * the run's own value as the prior, so a change made before its record exists can only be undone back to
     * the state the run itself created.
     */
    async #record(peer: ClientNode, kind: string, key: string) {
        // A record outlives the node's presence, so it names the node by the identity that is never re-issued.
        // A node with none cannot be named at all, which is the same node a restart could not resolve.
        const address = addressOf(peer);
        if (address === undefined) {
            throw new TaskFailedError(
                `Task ${runLabel(this.record.runId)}: ${peer.id} has no address, so what it is asked to hold cannot be recorded`,
            );
        }
        if (this.record.changeSet.some(e => PeerAddress.is(e.peer, address) && e.kind === kind && e.key === key)) {
            return;
        }
        const existing = peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind, key)];
        const prior = existing === undefined ? undefined : { intent: existing.intent, mode: existing.mode };
        await this.persistChanges({
            changeSet: [...this.record.changeSet, { peer: address, kind, key, prior }],
            // Permanent, unlike the entries: a retirement drops what a run would restore once nothing can
            // restore it, and every other run of the target still has to know this one reached the device.
            wrote: true,
        });
    }

    async removeIntentIfUnreferenced(peer: ClientNode, kind: ItemKind, key: string): Promise<boolean> {
        // The registered kind answers, not the reference the caller passed: a task names a kind for its type,
        // but the reconciler owns what that kind does.
        if (this.#requireRegistered(kind).isReferenced?.(peer, key)) {
            logger.debug(
                `Task ${runLabel(this.record.runId)}: keep ${kind.kind}:${key} on ${peerLabel(peer)} (still referenced)`,
            );
            return false;
        }
        return this.removeIntent(peer, kind, key);
    }

    async awaitCommitted(items: Array<{ peer: ClientNode; kind: ItemKind; key: string }>): Promise<void> {
        for (const item of items) {
            this.#requireRegistered(item.kind);
        }
        const peers = [...new Set(items.map(i => i.peer))];
        await this.awaitGate(peers, () => {
            this.#requireAwaited(items);
            return items.every(i => this.#itemState(i.peer, i.kind.kind, i.key) === "committed");
        });
    }

    /**
     * A commit gate only ever observes success, so an intent the engine gave up on would park the task
     * forever. Fail it into the driver's rollback path, saying which end the item reached.
     */
    #requireAwaited(items: Array<{ peer: ClientNode; kind: ItemKind; key: string }>): void {
        const gone = items.find(i => this.#itemState(i.peer, i.kind.kind, i.key) === undefined);
        if (gone === undefined) {
            return;
        }
        const conclusion = this.#conclusions.get(itemMapKey(gone.kind.kind, gone.key));
        // An item awaited for commit that was *removed* is as fatal as one abandoned — something else took
        // it away — but the two say different things about the device, so the message does not guess.
        const ending =
            conclusion === undefined
                ? "it is gone, and nothing said how"
                : conclusion.outcome === "removed"
                  ? "it was removed while this run awaited it"
                  : conclusion.reason;
        throw new TaskFailedError(
            `Task ${runLabel(this.record.runId)}: awaited intent ${gone.kind.kind}:${gone.key} on ${peerLabel(gone.peer)} is gone — ` +
                `${ending}, so it can no longer commit`,
        );
    }

    /**
     * How the engine finished with items this phase asked about, by item key.
     *
     * Phase-scoped on purpose: a conclusion matters to whoever is waiting on that item now, and an answer
     * kept longer would describe an intent a later run never wrote.
     */
    readonly #conclusions = new Map<string, ItemConclusion>();

    /** Peers whose conclusions this context is following, with the observers doing the following. */
    readonly #watched = new Set<ClientNode>();
    readonly #watchers = new ObserverGroup();

    #watchConclusions(peer: ClientNode) {
        if (this.#watched.has(peer)) {
            return;
        }
        this.#watched.add(peer);
        this.#watchers.on(peer.eventsOf(DesiredStateBehavior).itemConcluded, (kind, key, conclusion) => {
            this.#conclusions.set(itemMapKey(kind, key), conclusion);
        });
    }

    /** Stop following conclusions. The phase that asked for them has ended. */
    close() {
        this.#watchers.close();
        this.#watched.clear();
        this.#conclusions.clear();
    }

    /**
     * Suspend until the engine has removed each item, failing if it gave up on one instead.
     *
     * Not "until the item is absent": an item the engine abandoned is equally absent, and reading that as
     * success tells a caller the device no longer holds something it does.
     */
    async awaitRemoved(items: Array<{ peer: ClientNode; kind: ItemKind; key: string }>): Promise<void> {
        for (const item of items) {
            this.#requireRegistered(item.kind);
            this.#watchConclusions(item.peer);
        }
        const peers = [...new Set(items.map(i => i.peer))];
        await this.awaitGate(peers, () => {
            for (const item of items) {
                const conclusion = this.#conclusions.get(itemMapKey(item.kind.kind, item.key));
                if (conclusion?.outcome === "abandoned") {
                    throw new TaskFailedError(
                        `Task ${runLabel(this.record.runId)}: ${item.kind.kind}:${item.key} on ${peerLabel(item.peer)} was not removed — ` +
                            `${conclusion.reason}, so the device may still hold it`,
                    );
                }
            }
            return items.every(
                item => this.#conclusions.get(itemMapKey(item.kind.kind, item.key))?.outcome === "removed",
            );
        });
    }

    /**
     * Suspend until `until` holds over the peers' desired-state items, re-evaluated by verify-reconcile.
     * Watches each peer's item events + subscription status via a per-gate {@link ObserverGroup} (NOT
     * `reactTo`, which is same-node only). While any peer is unreachable the task parks; it runs otherwise.
     */
    async awaitGate(nodes: ClientNode[], until: (items: ManagedItem[]) => boolean): Promise<void> {
        const aborted = this.gate?.aborted();
        if (aborted !== undefined) {
            throw asError(aborted);
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
                        logger.warn(
                            `Task ${runLabel(this.record.runId)}: ignoring late gate-evaluation error after settle:`,
                            err,
                        );
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
                        // An abort can settle the gate while an evaluation is in flight: a follow-up reconcile
                        // would race the rollback a cancel spawns next, and nothing awaits it any more.
                        if (settled) {
                            return;
                        }
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
                const items = node.eventsOf(DesiredStateBehavior);
                observers.on(items.itemChanged, recheck);
                // An item that concluded announces itself here, not on `itemChanged`: without this a gate
                // waiting on one the engine gave up on parks with nothing left to wake it. The conclusion is
                // recorded before the re-evaluation that reads it.
                this.#watchConclusions(node);
                observers.on(items.itemConcluded, recheck);
                observers.on(node.eventsOf(NetworkClient).subscriptionStatusChanged, recheck);
            }
            unregisterAbort = this.gate?.onAbort(recheck);

            // The first evaluation must run with every wakeup source already registered, so that a change,
            // removal, reachability flip or abort arriving while it is in flight coalesces into a follow-up
            // evaluation instead of being announced before anything listens.
            try {
                recheck();
            } catch (e) {
                // Observers outliving the gate keep reconciling the peer on behalf of a task that is gone.
                finish(e);
            }
        });

        this.setState("running");
    }

    async #evaluate(nodes: ClientNode[], until: (items: ManagedItem[]) => boolean): Promise<boolean> {
        // A gate resolves only on freshly verified state, never on trust-stored committed items.
        if (nodes.some(node => !this.#reachable(node))) {
            return false;
        }
        for (const node of nodes) {
            await this.reconciler.reconcile(node, { verify: true });
        }
        const items = nodes.flatMap(node => Object.values(node.stateOf(DesiredStateBehavior).items));
        return until(items);
    }

    #classify(nodes: ClientNode[]) {
        this.setState(nodes.some(node => !this.#reachable(node)) ? "parked" : "running");
    }

    itemAbsent(peer: ClientNode, kind: ItemKind, key: string): boolean {
        this.#requireRegistered(kind);
        return peer.stateOf(DesiredStateBehavior).items[itemMapKey(kind.kind, key)] === undefined;
    }

    peersWithIntent(kind: ItemKind, key: string): ClientNode[] {
        this.#requireRegistered(kind);
        const id = itemMapKey(kind.kind, key);
        return this.peerLister().filter(peer => {
            const item = peer.stateOf(DesiredStateBehavior).items[id];
            return item !== undefined && item.status.state !== "deletePending";
        });
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
