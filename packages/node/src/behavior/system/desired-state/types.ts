/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Time, Timestamp } from "@matter/general";

/**
 * Lifecycle state of a managed item, mirroring the JFDS DatastoreStateEnum.
 *
 * An item leaves desired state only when what it asked for is done: an applied item reaches `committed` and
 * stays, a removed item goes. An item the engine gave up on keeps its place in `commitFailed`, carrying the
 * status that says why. Deleting that one would leave the device holding something desired state no longer
 * mentions, and would make a failure indistinguishable from a removal that worked — to a caller now, and to
 * the next start, which has only what is stored.
 *
 * `commitFailed` is the specification's `CommitFailure`, which says an operation failed without saying which.
 * See {@link ManagedItem.outstanding} for that.
 */
export type ItemState = "pending" | "committed" | "deletePending" | "commitFailed";

/** The operation an item is waiting for the engine to carry out. */
export type ItemOperation = "apply" | "remove";

/** Whether an item is pushed once (`converge`) or continuously enforced (`maintain`). */
export type ItemMode = "converge" | "maintain";

export interface StatusEntry {
    state: ItemState;
    updateTimestamp: Timestamp;
    failureCode?: number;
}

export interface ManagedItem<I = unknown> {
    kind: string;
    key: string;
    intent: I;
    mode: ItemMode;
    status: StatusEntry;

    /**
     * The operation the engine still owes this item.
     *
     * Kept beside the reported status rather than in it: a failure sets {@link ItemState} to `commitFailed`,
     * which cannot say whether an apply or a removal failed, and planning the wrong one re-adds an entry a
     * caller asked to remove.
     */
    outstanding: ItemOperation;

    /**
     * Counts every intent written for this `(kind, key)`, so a slow operation can tell whether the item it
     * was working on is still the one stored.
     *
     * An identity of its own rather than the intent value: an intent may be a primitive, and a caller may
     * write the same object twice, so comparing what was written cannot tell a replacement from the original.
     * A status write leaves it alone — only a new intent, or a removal, is a new thing to converge.
     *
     * Never reused for a `(kind, key)` within a process, even after the item was dropped and added again.
     */
    generation: number;
}

/**
 * How far this runtime has gone in enforcing a committed item against drift. Volatile: a restart starts every item
 * without one.
 *
 * The observed drift and the hold are separate facts. A drift ends when the device holds the item again; a hold ends
 * only by an action, so an item another administrator restores for a moment does not resume enforcement on its own.
 */
export interface ItemEnforcement {
    /**
     * The drift a live read confirmed and the engine did not write back, with when it was first confirmed. Absent
     * once a live read finds the device right again or the item is written.
     */
    drift?: { confirmedAt: Timestamp };

    /**
     * Whether the engine stopped writing the item back because its re-apply budget was spent. Ends only through the
     * reconciler's `retry()`, a removed or new intent, or the item's removal.
     */
    held: boolean;

    /**
     * For each re-apply after a drift, when it stops counting against the item's re-apply budget, on
     * {@link Time.nowUs} (monotonic where the platform provides it), oldest first. May still hold expired entries;
     * {@link currentReapplies} counts the rest.
     */
    reappliesUntil: readonly Timestamp[];
}

/** How many of the item's re-applies still count against its re-apply budget now. */
export function currentReapplies(enforcement: ItemEnforcement | undefined): number {
    if (enforcement === undefined) {
        return 0;
    }
    const now = Time.nowUs;
    return enforcement.reappliesUntil.filter(until => until > now).length;
}

export function newStatus(state: ItemState, failureCode?: number): StatusEntry {
    return { state, updateTimestamp: Time.nowMs, failureCode };
}

// ASCII Unit Separator: never present in identifier/number keys, so kind and key join unambiguously.
const ITEM_KEY_SEPARATOR = "\u001f";

export function itemMapKey(kind: string, key: string): string {
    return `${kind}${ITEM_KEY_SEPARATOR}${key}`;
}
