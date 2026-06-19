/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Events as BaseEvents } from "#behavior/Events.js";
import { Observable } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import { assertCapacity, CapacityCache } from "./capacity.js";
import type { CapacityInfo } from "./ItemKind.js";
import { itemMapKey, ItemMode, ItemState, ManagedItem, newStatus } from "./types.js";

/**
 * Per-ClientNode store of intended state. Holds {@link ManagedItem}s and an observed device
 * capacity cache, both persisted. Passive: it tracks intent and status but performs no network
 * I/O. The Reconciler (separate package) drives items toward the node.
 */
export class DesiredStateBehavior extends Behavior {
    static override readonly id = "desiredState";

    declare readonly state: DesiredStateBehavior.State;
    declare readonly events: DesiredStateBehavior.Events;

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
            FieldElement({
                name: "capacities",
                type: "any",
                quality: "N",
                default: { type: "properties", properties: {} },
            }),
        ],
    });

    setIntent<I>(kind: string, key: string, intent: I, mode: ItemMode = "converge"): ManagedItem<I> {
        const item: ManagedItem<I> = { kind, key, intent, mode, status: newStatus("pending") };
        this.state.items = { ...this.state.items, [itemMapKey(kind, key)]: item };
        this.events.itemChanged.emit(item);
        return item;
    }

    removeIntent(kind: string, key: string): void {
        const id = itemMapKey(kind, key);
        const existing = this.state.items[id];
        if (existing === undefined) {
            return;
        }
        const item: ManagedItem = { ...existing, status: newStatus("deletePending") };
        this.state.items = { ...this.state.items, [id]: item };
        this.events.itemChanged.emit(item);
    }

    updateStatus(kind: string, key: string, state: ItemState, failureCode?: number): void {
        const id = itemMapKey(kind, key);
        const existing = this.state.items[id];
        if (existing === undefined) {
            return;
        }
        const item: ManagedItem = { ...existing, status: newStatus(state, failureCode) };
        this.state.items = { ...this.state.items, [id]: item };
        this.events.itemChanged.emit(item);
    }

    dropItem(kind: string, key: string): void {
        const id = itemMapKey(kind, key);
        if (this.state.items[id] === undefined) {
            return;
        }
        const { [id]: _removed, ...rest } = this.state.items;
        this.state.items = rest;
        this.events.itemRemoved.emit(kind, key);
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

    assertCanAdd(kind: string, requested = 1): void {
        assertCapacity(kind, this.state.capacities, requested);
    }
}

export namespace DesiredStateBehavior {
    export class State {
        items: Record<string, ManagedItem> = {};
        capacities: CapacityCache = {};
    }

    export class Events extends BaseEvents {
        itemChanged = new Observable<[item: ManagedItem]>();
        itemRemoved = new Observable<[kind: string, key: string]>();
    }
}
