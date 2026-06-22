/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Time, Timestamp } from "@matter/general";

/** Lifecycle state of a managed item, mirroring the JFDS DatastoreStateEnum. */
export type ItemState = "pending" | "committed" | "deletePending" | "commitFailed";

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
}

export function newStatus(state: ItemState, failureCode?: number): StatusEntry {
    return { state, updateTimestamp: Time.nowMs, failureCode };
}

function escapeKeyPart(part: string): string {
    return part.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

export function itemMapKey(kind: string, key: string): string {
    return `${escapeKeyPart(kind)}:${escapeKeyPart(key)}`;
}
