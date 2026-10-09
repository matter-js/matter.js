/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientNode } from "#node/ClientNode.js";
import { DuplicateItemKindError, UnknownItemKindError } from "./errors.js";
import type { ManagedItem } from "./types.js";

/** Observed device limit and current usage for a kind on one node. */
export interface CapacityInfo {
    limit: number;
    used: number;
}

export interface ItemKind<I = unknown> {
    readonly kind: string;

    readonly priority: number;

    apply(node: ClientNode, item: ManagedItem<I>): Promise<void>;
    read?(node: ClientNode): Promise<ManagedItem<I>[]>;
    diff?(intent: I, current: I): boolean;

    /**
     * Report whether the device currently satisfies `item`. `true` = no drift. The engine consults
     * this on a verify pass to decide which committed items to re-pend. Kinds own the device read
     * and match; `read`/`diff` remain optional helpers.
     */
    verify?(node: ClientNode, item: ManagedItem<I>): Promise<boolean>;

    remove?(node: ClientNode, item: ManagedItem<I>): Promise<void>;
    recoverable?(code: number): boolean;
    capacity?(node: ClientNode): Promise<CapacityInfo>;

    /**
     * Exclude this kind from pre-flight task admission. Set when `capacity` counts a coarser resource than
     * this kind's per-item key (e.g. per-endpoint membership sharing a per-group limit), so admitting it
     * would double-count a slot another kind already gates. `capacity` still serves the reconciler.
     */
    readonly excludeFromAdmission?: boolean;

    /**
     * Report whether another live desired-state intent still depends on the `(kind, key)` entry, so a
     * shared entry is not deleted while referenced. Unimplemented ⇒ no dependents ⇒ always removable.
     */
    isReferenced?(node: ClientNode, key: string): boolean;
}

export class ItemKindRegistry {
    readonly #kinds = new Map<string, ItemKind>();

    register(kind: ItemKind): void {
        if (this.#kinds.has(kind.kind)) {
            throw new DuplicateItemKindError(`Item kind "${kind.kind}" is already registered`);
        }
        this.#kinds.set(kind.kind, kind);
    }

    get(kind: string): ItemKind | undefined {
        return this.#kinds.get(kind);
    }

    require(kind: string): ItemKind {
        const found = this.#kinds.get(kind);
        if (found === undefined) {
            throw new UnknownItemKindError(`No item kind registered for "${kind}"`);
        }
        return found;
    }

    all(): ItemKind[] {
        return [...this.#kinds.values()].sort((a, b) => a.priority - b.priority);
    }
}
