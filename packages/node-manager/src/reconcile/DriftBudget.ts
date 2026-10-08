/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Time, Timestamp } from "@matter/general";
import { itemMapKey, ManagedItem } from "@matter/node";

/**
 * Limits how often an item is re-applied after drift, per peer: every re-apply counts, whatever pass made it.
 *
 * Without a limit, a device that keeps changing the value (or another administrator that keeps rewriting it) would
 * start a write fight that never ends.
 *
 * An entry belongs to one {@link ManagedItem.generation}; any other generation sees no spends, so a rewritten or
 * re-added item never inherits a spent budget.
 */
export class DriftBudget {
    readonly #policy: () => { count: number; window: Duration };
    readonly #spent = new Map<string, { generation: number; at: Array<Timestamp> }>();

    /** @param policy Read on every call, so a changed `ReconcilerBehavior.State.driftBudget` applies at once. */
    constructor(policy: () => { count: number; window: Duration }) {
        this.#policy = policy;
    }

    /** Whether fewer than `count` re-applies of the item happened within `window` of now. */
    left(item: ManagedItem): boolean {
        return this.spent(item) < this.#policy().count;
    }

    /** How many re-applies of the item happened within `window` of now. */
    spent(item: ManagedItem): number {
        return this.#recent(item).length;
    }

    /** Records one re-apply of the item now. */
    spend(item: ManagedItem): void {
        const key = itemMapKey(item.kind, item.key);
        const recent = this.#recent(item);
        recent.push(Time.nowUs);
        this.#spent.set(key, { generation: item.generation, at: recent });
    }

    /** Forget every spend of the item, so its full budget is available again. */
    reset(item: ManagedItem): void {
        this.#spent.delete(itemMapKey(item.kind, item.key));
    }

    #recent(item: ManagedItem): Array<Timestamp> {
        const entry = this.#spent.get(itemMapKey(item.kind, item.key));
        if (entry === undefined || entry.generation !== item.generation) {
            return new Array<Timestamp>();
        }
        const since = Time.nowUs - this.#policy().window;
        return entry.at.filter(at => at > since);
    }
}
