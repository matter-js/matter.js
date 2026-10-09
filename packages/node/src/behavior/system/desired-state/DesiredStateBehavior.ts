/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Events as BaseEvents } from "#behavior/Events.js";
import { Duration, Observable, Time, Timestamp } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import { assertCanAddItems, CapacityCache } from "./capacity.js";
import type { CapacityInfo } from "./ItemKind.js";
import { ItemEnforcement, itemMapKey, ItemMode, ItemState, ManagedItem, newStatus } from "./types.js";

/**
 * Per-ClientNode store of intended state. Holds persisted {@link ManagedItem}s and, volatile, the
 * observed device capacity cache and the {@link ItemEnforcement} of committed items. Passive: it tracks intent
 * and status but performs no network I/O. The Reconciler (separate package) drives items toward the node.
 */
export class DesiredStateBehavior extends Behavior {
    static override readonly id = "desiredState";

    declare readonly state: DesiredStateBehavior.State;
    declare readonly events: DesiredStateBehavior.Events;
    declare internal: DesiredStateBehavior.Internal;

    static override readonly schema = new DatatypeModel({
        name: "DesiredState",
        type: "struct",
        children: [
            FieldElement({
                name: "items",
                type: "any",
                quality: "N",
                default: { type: "properties", properties: {} },
            }),
        ],
    });

    setIntent<I>(kind: string, key: string, intent: I, mode: ItemMode = "converge"): ManagedItem<I> {
        const item: ManagedItem<I> = {
            kind,
            key,
            intent,
            mode,
            status: newStatus("pending"),
            outstanding: "apply",
            generation:
                Math.max(
                    this.state.items[itemMapKey(kind, key)]?.generation ?? 0,
                    this.internal.droppedGenerations.get(itemMapKey(kind, key)) ?? 0,
                ) + 1,
        };
        this.internal.droppedGenerations.delete(itemMapKey(kind, key));
        this.state.items = { ...this.state.items, [itemMapKey(kind, key)]: item };
        this.#writeEnforcement(kind, key, undefined);
        this.events.itemChanged.emit(item);
        return item;
    }

    removeIntent(kind: string, key: string): void {
        const id = itemMapKey(kind, key);
        const existing = this.state.items[id];
        if (existing === undefined) {
            return;
        }
        const item: ManagedItem = {
            ...existing,
            status: newStatus("deletePending"),
            outstanding: "remove",
            generation: existing.generation + 1,
        };
        this.state.items = { ...this.state.items, [id]: item };
        this.#writeEnforcement(kind, key, undefined);
        this.events.itemChanged.emit(item);
    }

    /**
     * Record what became of an item.
     *
     * `ifGeneration` names the intent the status describes. The engine reads an item, yields while it works,
     * and writes the outcome here; a caller that replaced the intent meanwhile gets a new generation, and this
     * write is dropped rather than describing the new intent by what happened to the old one. The comparison
     * belongs here because this is where the item is written: a caller that compared first would be deciding
     * outside the transaction that acts on the decision.
     */
    updateStatus(kind: string, key: string, state: ItemState, failureCode?: number, ifGeneration?: number): void {
        const id = itemMapKey(kind, key);
        const existing = this.state.items[id];
        if (existing === undefined || (ifGeneration !== undefined && existing.generation !== ifGeneration)) {
            return;
        }
        const item: ManagedItem = { ...existing, status: newStatus(state, failureCode) };
        this.state.items = { ...this.state.items, [id]: item };
        this.#writeEnforcement(kind, key, withoutDrift(this.state.enforcement[id]));
        this.events.itemChanged.emit(item);
    }

    /**
     * Take an item out of desired state, which says that what it asked for is done.
     *
     * The only meaning absence carries. An item the engine gave up on stays, in `commitFailed` — see
     * {@link ItemState} — so nothing has to infer from a missing item what became of it.
     *
     * `ifGeneration` names the intent being dropped, so a removal that yielded does not take a fresh intent
     * with it; see {@link updateStatus}.
     */
    dropItem(kind: string, key: string, ifGeneration?: number): void {
        const id = itemMapKey(kind, key);
        const existing = this.state.items[id];
        if (existing === undefined || (ifGeneration !== undefined && existing.generation !== ifGeneration)) {
            return;
        }
        const { [id]: _removed, ...rest } = this.state.items;
        this.state.items = rest;
        this.internal.droppedGenerations.set(id, existing.generation);
        this.#writeEnforcement(kind, key, undefined);
        this.events.itemRemoved.emit(kind, key);
    }

    /**
     * Record that a live read confirmed the item differs from the device, and the engine did not write it back.
     *
     * Written only beside a `committed` item, and, when `ifGeneration` is given, only if that is still the
     * intent the read was made for; see {@link updateStatus}. An item that is pending, being removed or gone
     * has nothing the device is expected to hold, so nothing can have drifted from it. A drift already observed
     * keeps the time it was first confirmed.
     */
    markDrift(kind: string, key: string, ifGeneration?: number): void {
        this.#enforce(kind, key, ifGeneration, current =>
            current.drift === undefined ? { ...current, drift: confirmedNow() } : current,
        );
    }

    /**
     * Record a confirmed drift the engine stopped writing back because the item's re-apply budget is spent.
     * Written under the same conditions as {@link markDrift}.
     *
     * Only {@link releaseHold}, {@link setIntent}, {@link removeIntent} and {@link dropItem} end the hold.
     * Engine-internal: an operator ends a hold through the reconciler's `retry()`, a removed intent or a new one.
     */
    hold(kind: string, key: string, ifGeneration?: number): void {
        this.#enforce(kind, key, ifGeneration, current =>
            current.held && current.drift !== undefined
                ? current
                : { ...current, drift: current.drift ?? confirmedNow(), held: true },
        );
    }

    /** End the observed drift of an item because a live read found the device right again. A hold stays. */
    clearDrift(kind: string, key: string): void {
        this.#writeEnforcement(kind, key, withoutDrift(this.state.enforcement[itemMapKey(kind, key)]));
    }

    /**
     * Record one re-apply of the item after a drift, now; it counts against the item's re-apply budget for `window`.
     * Written under the same conditions as {@link markDrift}. Engine-internal.
     *
     * @returns whether it was recorded, which is false for an item rewritten or no longer committed
     */
    recordReapply(kind: string, key: string, window: Duration, ifGeneration?: number): boolean {
        return this.#enforce(kind, key, ifGeneration, current => ({
            ...current,
            reappliesUntil: [...current.reappliesUntil, Timestamp(Time.nowUs + window)],
        }));
    }

    /**
     * End the item's hold and start its re-apply budget over. Written under the same conditions as
     * {@link markDrift}. Engine-internal: an operator calls the reconciler's `retry()`, which calls this once the
     * item's live read succeeds.
     */
    releaseHold(kind: string, key: string, ifGeneration?: number): void {
        this.#enforce(kind, key, ifGeneration, current => ({ ...current, held: false, reappliesUntil: [] }));
    }

    /**
     * How far enforcement of the item has gone in this runtime, with only re-applies that still count against its
     * budget; `undefined` when there is no observed drift, no hold and no such re-apply.
     */
    enforcementOf(kind: string, key: string): ItemEnforcement | undefined {
        return current(this.state.enforcement[itemMapKey(kind, key)]);
    }

    getItem(kind: string, key: string): ManagedItem | undefined {
        return this.state.items[itemMapKey(kind, key)];
    }

    allItems(): ManagedItem[] {
        return Object.values(this.state.items);
    }

    itemsByKind(kind: string): ManagedItem[] {
        return Object.values(this.state.items).filter(item => item.kind === kind);
    }

    setCapacity(kind: string, info: CapacityInfo): void {
        this.state.capacities = { ...this.state.capacities, [kind]: info };
    }

    getCapacity(kind: string): CapacityInfo | undefined {
        return this.state.capacities[kind];
    }

    #enforce(
        kind: string,
        key: string,
        ifGeneration: number | undefined,
        change: (current: ItemEnforcement) => ItemEnforcement,
    ): boolean {
        const id = itemMapKey(kind, key);
        const existing = this.state.items[id];
        if (
            existing === undefined ||
            existing.status.state !== "committed" ||
            (ifGeneration !== undefined && existing.generation !== ifGeneration)
        ) {
            return false;
        }
        this.#writeEnforcement(kind, key, change(this.state.enforcement[id] ?? { held: false, reappliesUntil: [] }));
        return true;
    }

    /**
     * The one writer of {@link State.enforcement}. Expired re-applies are dropped, a record that then says nothing is
     * removed, and {@link Events.itemEnforcementChanged} fires only when the observed drift or the hold changes.
     */
    #writeEnforcement(kind: string, key: string, change: ItemEnforcement | undefined) {
        const id = itemMapKey(kind, key);
        const previous = this.state.enforcement[id];
        const next = change === previous ? previous : current(change);
        if (previous === next) {
            return;
        }
        if (next === undefined) {
            const { [id]: _removed, ...rest } = this.state.enforcement;
            this.state.enforcement = rest;
        } else {
            this.state.enforcement = { ...this.state.enforcement, [id]: next };
        }
        if ((previous?.drift !== undefined) !== (next?.drift !== undefined) || !!previous?.held !== !!next?.held) {
            this.events.itemEnforcementChanged.emit(kind, key, next);
        }
    }

    /** See {@link assertCanAddItems}. */
    assertCanAdd(kind: string, keys: readonly string[]): void {
        assertCanAddItems(this.state, kind, keys);
    }
}

export namespace DesiredStateBehavior {
    export class State {
        items: Record<string, ManagedItem> = {};
        capacities: CapacityCache = {};

        /**
         * How far enforcement of each committed item has gone, keyed by {@link itemMapKey}. Volatile: not in the
         * schema, so a restart starts empty and the next verify finds a drift again.
         *
         * A record has the item's lifetime: {@link setIntent}, {@link removeIntent} and {@link dropItem} remove it,
         * so a rewritten or re-added item never inherits a hold or spent re-applies.
         */
        enforcement: Record<string, ItemEnforcement> = {};
    }

    export class Internal {
        /**
         * The last generation of each dropped item, so a re-added item continues from it. Volatile: after a restart
         * no operation of the previous process is left that could carry an old generation.
         */
        droppedGenerations = new Map<string, number>();
    }

    export class Events extends BaseEvents {
        itemChanged = new Observable<[item: ManagedItem]>();
        itemRemoved = new Observable<[kind: string, key: string]>();

        /**
         * An item's observed drift or hold began or ended. `enforcement` is the item's record now, `undefined` when it
         * has none left.
         */
        itemEnforcementChanged = new Observable<
            [kind: string, key: string, enforcement: ItemEnforcement | undefined]
        >();
    }
}

/** The record with expired re-applies dropped, or `undefined` when nothing current is left. */
function current(enforcement: ItemEnforcement | undefined): ItemEnforcement | undefined {
    if (enforcement === undefined) {
        return undefined;
    }
    const now = Time.nowUs;
    const reappliesUntil = enforcement.reappliesUntil.filter(until => until > now);
    if (enforcement.drift === undefined && !enforcement.held && reappliesUntil.length === 0) {
        return undefined;
    }
    return reappliesUntil.length === enforcement.reappliesUntil.length
        ? enforcement
        : { ...enforcement, reappliesUntil };
}

function confirmedNow(): ItemEnforcement["drift"] {
    return { confirmedAt: Time.nowMs };
}

function withoutDrift(enforcement: ItemEnforcement | undefined): ItemEnforcement | undefined {
    if (enforcement?.drift === undefined) {
        return enforcement;
    }
    const { drift: _ended, ...rest } = enforcement;
    return rest;
}
