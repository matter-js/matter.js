/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task } from "#task/Task.js";
import { TaskPhase } from "#task/types.js";
import { Observable } from "@matter/general";
import { ClientNode, DesiredStateBehavior, ItemMode, ItemState, ManagedItem, itemMapKey } from "@matter/node";

/** A synthetic task whose phases are supplied inline; for unit-testing the manager/driver. */
export class SyntheticTask extends Task<{ tag: string }> {
    static phasesByTag: Record<string, TaskPhase[]> = {};
    override readonly type = "synthetic";
    override get phases() {
        return SyntheticTask.phasesByTag[this.params.tag] ?? new Array<TaskPhase>();
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
 */
export class FakePeer {
    readonly items: Record<string, ManagedItem> = {};
    readonly has = new Set<string>();
    readonly itemChanged = new Observable<[item: ManagedItem]>();
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

    setState(kind: string, key: string, state: ItemState) {
        const item = this.items[itemMapKey(kind, key)];
        item.status = { ...item.status, state };
        this.itemChanged.emit(item);
    }

    /** Fake ReconcilerBehavior.reconcile: on verify, commit pending items the device "has" while reachable. */
    async reconcile(node: ClientNode, options?: { verify?: boolean }) {
        this.reconciles++;
        if (!options?.verify || !this.#subscribed) {
            return;
        }
        const items = (node as unknown as FakePeer).items;
        for (const item of Object.values(items)) {
            if (item.status.state === "pending" && this.has.has(itemMapKey(item.kind, item.key))) {
                item.status = { ...item.status, state: "committed" };
            } else if (item.status.state === "deletePending") {
                delete items[itemMapKey(item.kind, item.key)];
            }
        }
    }

    /** Reconciler stand-in: no kind has dependents by default (tests override per case). */
    itemKind(_kind: string): unknown {
        return undefined;
    }

    eventsOf(type: unknown): unknown {
        return type === DesiredStateBehavior
            ? { itemChanged: this.itemChanged }
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
