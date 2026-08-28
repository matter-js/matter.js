/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded, ImplementationError } from "@matter/general";
import type { ClientNode, ItemMode, ManagedItem } from "@matter/node";

/**
 * Identity of one run of a task. A re-run of the same target is a different run with a different id, so no
 * record is ever overwritten.
 *
 * Branded because this layer carries several bare counters side by side — {@link RetireSeq} above all — and
 * ordering by the wrong one is the defect class the retirement order exists to prevent.
 */
export type RunId = Branded<number, "RunId">;

export function RunId(value: number): RunId {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new ImplementationError(`Invalid run id ${value}`);
    }
    return value as RunId;
}

/**
 * Order in which runs retired: the only ordering key for history and for eviction.
 *
 * Deliberately a different type from {@link RunId}. A run id orders by *start*, and since a parked run may
 * finish long after runs that started later, ordering retirement by run id evicts the most recently finished
 * work first.
 */
export type RetireSeq = Branded<number, "RetireSeq">;

export function RetireSeq(value: number): RetireSeq {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new ImplementationError(`Invalid retirement sequence ${value}`);
    }
    return value as RetireSeq;
}

export type TaskState = "running" | "parked" | "completed" | "failed" | "cancelled";

export interface TaskStatus {
    runId: RunId;
    /**
     * The target this run intends to change. Visible so a caller can tell which work it joined, but not an
     * address: there is no lookup by slot, because "the run for this slot" is well defined only for live runs
     * and answering it for retired ones needs a preference rule.
     */
    slotKey: string;
    type: string;
    state: TaskState;
    phaseIndex?: number;
    /** Id the caller of `run` asked for this task under, if it supplied one. */
    externalId?: string;
    error?: string;
    /** Set once the run retired. */
    retireSeq?: RetireSeq;
    revertRunId?: RunId;
    revertOf?: RunId;
    /** Whether the answering record still carries everything, or only what a tombstone keeps. */
    detail: "full" | "tombstone";
}

export interface ChangeEntry {
    peerId: string;
    kind: string;
    key: string;
    prior?: { intent: unknown; mode: ItemMode };
}

/** An intent a task will create, derived from its params, for pre-flight capacity admission. */
export interface PlannedChange {
    peerId: string;
    kind: string;
    key: string;
    intent: unknown;
}

export interface TaskPhase {
    name: string;
    run(ctx: TaskContext): Promise<void>;
}

export interface TaskContext {
    resolvePeer(peerId: string): ClientNode;
    tryResolvePeer(peerId: string): ClientNode | undefined;
    setIntent(peer: ClientNode, kind: string, key: string, intent: unknown, mode?: ItemMode): Promise<void>;
    removeIntent(peer: ClientNode, kind: string, key: string): Promise<void>;
    removeIntentIfUnreferenced(peer: ClientNode, kind: string, key: string): Promise<boolean>;
    awaitGate(nodes: ClientNode[], until: (items: ManagedItem[]) => boolean): Promise<void>;
    awaitCommitted(items: Array<{ peer: ClientNode; kind: string; key: string }>): Promise<void>;
    itemAbsent(peer: ClientNode, kind: string, key: string): boolean;
    peersWithIntent(kind: string, key: string): ClientNode[];
}
