/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task } from "#task/Task.js";
import { PlannedChange, TaskPhase } from "#task/types.js";
import { Observable } from "@matter/general";
import { ClientNode, DesiredStateBehavior, ItemKind, ItemMode, ItemState, ManagedItem, itemMapKey } from "@matter/node";
import { Status } from "@matter/types";

/** Mirrors the reconciler's default recoverability rule for a failure status code. */
function recoverable(code?: number): boolean {
    return code === Status.Timeout || code === Status.Busy;
}

/** A synthetic task whose phases are supplied inline; for unit-testing the manager/driver. */
export class SyntheticTask extends Task<{ tag: string }> {
    static phasesByTag: Record<string, TaskPhase[]> = {};
    static plannedChangesByTag: Record<string, PlannedChange[]> = {};
    override readonly type = "synthetic";
    override get phases() {
        return SyntheticTask.phasesByTag[this.params.tag] ?? new Array<TaskPhase>();
    }
    override plannedChanges(): PlannedChange[] {
        return SyntheticTask.plannedChangesByTag[this.params.tag] ?? new Array<PlannedChange>();
    }
    static override idFor(params: { tag: string }) {
        return `synthetic:${params.tag}`;
    }
}

/**
 * In-memory peer for unit-testing the convergence gates. Exposes only the surface the gate reads:
 * `DesiredStateBehavior` items + `itemChanged`, `NetworkClient` subscription status, and the reachability
 * source of truth (`behaviors.internalsOf(NetworkClient).activeSubscription`). The fake doubles as the
 * reconciler: `reconcile(node, {verify})` flips the peer's items to `committed` for keys the device "has".
 *
 * One simplification of the real engine: a key the device neither has nor fails stays `pending` instead of
 * committing, which is how a test holds a gate parked.
 */
export class FakePeer {
    readonly items: Record<string, ManagedItem> = {};
    readonly has = new Set<string>();
    /** Keys the device rejects with an unrecoverable status: apply fails, and the following pass drops them. */
    readonly rejects = new Set<string>();
    /** Remaining recoverable apply failures per key: each pass consumes one, then the key behaves normally. */
    readonly transientFailures = new Map<string, number>();
    readonly itemChanged = new Observable<[item: ManagedItem]>();
    readonly itemRemoved = new Observable<[kind: string, key: string]>();
    readonly subscriptionStatusChanged = new Observable<[isActive: boolean]>();
    #subscribed = true;
    reconciles = 0;

    constructor(readonly id: string) {}

    /** A real (non-Sustained) subscription instance reads as active; undefined reads as unreachable. */
    get #activeSubscription() {
        return this.#subscribed ? {} : undefined;
    }

    setReachable(reachable: boolean) {
        this.#subscribed = reachable;
        this.subscriptionStatusChanged.emit(reachable);
    }

    /** Add a desired item in a given state and announce the change, as DesiredStateBehavior would. */
    addItem(kind: string, key: string, state: ItemState = "pending") {
        const item: ManagedItem = {
            kind,
            key,
            intent: {},
            mode: "converge",
            status: { state, updateTimestamp: 0 },
        };
        this.items[itemMapKey(kind, key)] = item;
        this.itemChanged.emit(item);
    }

    /** Record the desired-state mutations the gate observes so cancel-revert order can be asserted. */
    readonly removeOrder = new Array<string>();

    // Stores real intent+mode (not a placeholder) so the context's prior-capture reads true values.
    setIntent(kind: string, key: string, intent: unknown = {}, mode: ItemMode = "converge") {
        const existing = this.items[itemMapKey(kind, key)];
        const item: ManagedItem = {
            kind,
            key,
            intent,
            mode,
            status: existing?.status ?? { state: "pending", updateTimestamp: 0 },
        };
        this.items[itemMapKey(kind, key)] = item;
        this.itemChanged.emit(item);
    }

    /** DesiredStateBehavior.removeIntent stand-in: flag deletePending, then drop on the next reconcile. */
    removeIntent(kind: string, key: string) {
        const item = this.items[itemMapKey(kind, key)];
        if (item === undefined) {
            return;
        }
        this.removeOrder.push(itemMapKey(kind, key));
        item.status = { ...item.status, state: "deletePending" };
        this.itemChanged.emit(item);
    }

    /** Fake Endpoint.act: synchronously runs the callback with a fake agent exposing DesiredStateBehavior. */
    act<T>(fn: (agent: { get(type: unknown): unknown }) => T): T {
        const desired = {
            setIntent: (kind: string, key: string, intent: unknown, mode?: ItemMode) =>
                this.setIntent(kind, key, intent, mode),
            removeIntent: (kind: string, key: string) => this.removeIntent(kind, key),
        };
        return fn({ get: (type: unknown) => (type === DesiredStateBehavior ? desired : undefined) });
    }

    /** Mark a key as present on the device, so the next verify-reconcile commits it. */
    markHas(kind: string, key: string) {
        this.has.add(itemMapKey(kind, key));
    }

    /** Mark a key the device refuses with an unrecoverable status. */
    markRejects(kind: string, key: string) {
        this.rejects.add(itemMapKey(kind, key));
    }

    /** Mark a key whose next `times` applies fail with a recoverable status, so the reconciler retries them. */
    markFailsRecoverably(kind: string, key: string, times: number) {
        this.transientFailures.set(itemMapKey(kind, key), times);
    }

    /** DesiredStateBehavior.dropItem stand-in: forget the item and announce it on `itemRemoved`. */
    dropItem(kind: string, key: string) {
        if (this.items[itemMapKey(kind, key)] === undefined) {
            return;
        }
        delete this.items[itemMapKey(kind, key)];
        this.itemRemoved.emit(kind, key);
    }

    setState(kind: string, key: string, state: ItemState, failureCode?: number) {
        const item = this.items[itemMapKey(kind, key)];
        item.status = { ...item.status, state, failureCode };
        this.itemChanged.emit(item);
    }

    /**
     * Fake ReconcilerBehavior.reconcile over one peer's items, one pass per call, mirroring what
     * `planActions`/`executeActions` do with each item state: apply a pending item, retry or drop a failed one
     * by the recoverability of its status code, and drop a removal once the device has taken it.
     */
    async reconcile(node: ClientNode, options?: { verify?: boolean }) {
        this.reconciles++;
        if (!options?.verify || !this.#subscribed) {
            return;
        }
        const peer = node as unknown as FakePeer;
        for (const item of Object.values(peer.items)) {
            switch (item.status.state) {
                case "pending":
                    peer.#apply(item);
                    break;
                case "commitFailed":
                    if (recoverable(item.status.failureCode)) {
                        peer.#apply(item);
                    } else {
                        peer.dropItem(item.kind, item.key);
                    }
                    break;
                case "deletePending":
                    peer.dropItem(item.kind, item.key);
                    break;
                case "committed":
                    break;
            }
        }
    }

    /** One apply attempt against the device, with the status it writes back. */
    #apply(item: ManagedItem) {
        const id = itemMapKey(item.kind, item.key);
        const transient = this.transientFailures.get(id) ?? 0;
        if (transient > 0) {
            this.transientFailures.set(id, transient - 1);
            this.setState(item.kind, item.key, "commitFailed", Status.Busy);
        } else if (this.rejects.has(id)) {
            this.setState(item.kind, item.key, "commitFailed", Status.ConstraintError);
        } else if (this.has.has(id)) {
            this.setState(item.kind, item.key, "committed");
        }
    }

    /** Reconciler stand-in: no kind has dependents by default (tests override per case). */
    itemKind(_kind: string): ItemKind | undefined {
        return undefined;
    }

    eventsOf(type: unknown): unknown {
        return type === DesiredStateBehavior
            ? { itemChanged: this.itemChanged, itemRemoved: this.itemRemoved }
            : { subscriptionStatusChanged: this.subscriptionStatusChanged };
    }

    stateOf(type: unknown): unknown {
        return type === DesiredStateBehavior ? { items: this.items } : { isDisabled: false };
    }

    get behaviors() {
        const activeSubscription = this.#activeSubscription;
        return {
            has: () => true,
            internalsOf: () => ({ activeSubscription }),
        };
    }

    asNode(): ClientNode {
        return this as unknown as ClientNode;
    }
}
