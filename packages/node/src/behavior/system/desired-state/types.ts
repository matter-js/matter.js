/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Time, Timestamp } from "@matter/general";

/**
 * Lifecycle state of a managed item, mirroring the JFDS DatastoreStateEnum.
 *
 * What is *reported* about an item. `commitFailed` is the specification's `CommitFailure`, which says an
 * operation failed without saying which — so it is not what the engine plans from. See
 * {@link ManagedItem.outstanding} for that, and {@link ItemConclusion} for how an item ends.
 */
export type ItemState = "pending" | "committed" | "deletePending" | "commitFailed";

/** The operation an item is waiting for the engine to carry out. */
export type ItemOperation = "apply" | "remove";

/**
 * How the engine finished with an item, stated rather than inferred.
 *
 * An item that reaches `committed` concluded by being applied. The other two ends both take the item out of
 * desired state, and a caller has to tell them apart: `removed` is the removal a caller asked for, while
 * `abandoned` is the engine giving up, which leaves the device holding whatever it holds.
 */
export type ItemConclusion = { outcome: "removed" } | { outcome: "abandoned"; reason: string; failureCode?: number };

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
}

export function newStatus(state: ItemState, failureCode?: number): StatusEntry {
    return { state, updateTimestamp: Time.nowMs, failureCode };
}

// ASCII Unit Separator: never present in identifier/number keys, so kind and key join unambiguously.
const ITEM_KEY_SEPARATOR = "\u001f";

export function itemMapKey(kind: string, key: string): string {
    return `${kind}${ITEM_KEY_SEPARATOR}${key}`;
}
