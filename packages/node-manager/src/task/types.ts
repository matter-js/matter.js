/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded, ImplementationError } from "@matter/general";
import type { ClientNode, ItemKind, ItemMode, ManagedItem } from "@matter/node";

/**
 * Identity of one run of a task. A re-run of the same target is a different run with a different id, so no
 * record is ever overwritten.
 *
 * Branded because this layer carries several bare counters side by side — {@link RetireSeq} above all — and
 * ordering by the wrong one is the defect class the retirement order exists to prevent.
 */
export type RunId = Branded<number, "RunId">;

export function RunId(value: number): RunId {
    if (!isRunId(value)) {
        throw new ImplementationError(`Invalid run id ${value}`);
    }
    return value;
}

/** Whether a value read from storage can be a {@link RunId}. The one place the rule is stated. */
export function isRunId(value: unknown): value is RunId {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/**
 * Order in which runs retired: the only ordering key for history.
 *
 * Deliberately a different type from {@link RunId}. A run id orders by *start*, and since a parked run may
 * finish long after runs that started later, ordering retirement by run id evicts the most recently finished
 * work first.
 */
export type RetireSeq = Branded<number, "RetireSeq">;

export function RetireSeq(value: number): RetireSeq {
    if (!isRetireSeq(value)) {
        throw new ImplementationError(`Invalid retirement sequence ${value}`);
    }
    return value;
}

/** Whether a value read from storage can be a {@link RetireSeq}. */
export function isRetireSeq(value: unknown): value is RetireSeq {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/** A verb that takes ownership of a run's outcome, stopping its driver first. */
export type Teardown = "cancel" | "abandon";

/**
 * Where a run stands. `abandoned` belongs to rollbacks alone: an operator gave up on the undo, so the device is
 * knowingly left part-changed and the rollback is never retried.
 */
export type TaskState = "running" | "parked" | "completed" | "failed" | "cancelled" | "abandoned";

/** The states a record may hold, as a value, so a table read back from storage can be checked against them. */
export const TASK_STATES: ReadonlySet<string> = new Set<TaskState>([
    "running",
    "parked",
    "completed",
    "failed",
    "cancelled",
    "abandoned",
]);

/** Whether a value read from storage can be a {@link TaskState}. */
export function isTaskState(value: unknown): value is TaskState {
    return typeof value === "string" && TASK_STATES.has(value);
}

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
    phaseIndex: number;
    /**
     * Whether the run reached the device. A run can fail, be cancelled or be abandoned having changed nothing,
     * and an operator acts on those two cases differently.
     */
    wrote: boolean;
    /** Id the caller of `run` asked for this task under, if it supplied one. */
    externalId?: string;
    error?: string;
    /** Set once the run retired. */
    retireSeq?: RetireSeq;
    /** The undo this run answers to, once one exists. Pass it to `abandon`, never to `retryRollback`. */
    rollbackRunId?: RunId;
    /** The run this one undoes, when it is itself a rollback. Pass that id to `retryRollback`. */
    rollbackOf?: RunId;
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

    /**
     * Refuse the phase while the device state it depends on does not hold. Throw to refuse; the run then fails
     * and rolls back what it had written.
     *
     * Asked **twice**: before the phase writes anything, and again once its writes have committed. The second
     * ask is the one a task will not think of — a phase yields at every write and at its commit gate, so state
     * it checked on entry can change underneath it, and the layer takes no lock on anything a task touches.
     * Tasks that share items with other tasks need it; that is how a group-key rotation notices a member that
     * joined while it was running.
     */
    requires?(ctx: TaskContext): void;
}

export interface TaskContext {
    resolvePeer(peerId: string): ClientNode;
    tryResolvePeer(peerId: string): ClientNode | undefined;
    setIntent<I>(peer: ClientNode, kind: ItemKind<I>, key: string, intent: I, mode?: ItemMode): Promise<void>;
    removeIntent(peer: ClientNode, kind: ItemKind, key: string): Promise<void>;
    removeIntentIfUnreferenced(peer: ClientNode, kind: ItemKind, key: string): Promise<boolean>;
    awaitGate(nodes: ClientNode[], until: (items: ManagedItem[]) => boolean): Promise<void>;
    awaitCommitted(items: Array<{ peer: ClientNode; kind: ItemKind; key: string }>): Promise<void>;
    itemAbsent(peer: ClientNode, kind: ItemKind, key: string): boolean;
    peersWithIntent(kind: ItemKind, key: string): ClientNode[];

    /** The intent this peer currently holds for `(kind, key)`, typed by the kind. */
    intentOf<I>(peer: ClientNode, kind: ItemKind<I>, key: string): I | undefined;

    /**
     * The registered kind a persisted name refers to.
     *
     * Only a rollback needs this: it replays {@link ChangeEntry} values whose kind is a string read back from
     * storage, so it cannot name a kind at compile time the way a forward task does.
     */
    kindNamed(name: string): ItemKind;
}
