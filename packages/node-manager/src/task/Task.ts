/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { ChangeEntry, PlannedChange, RetireSeq, RunId, TaskPhase, TaskState, TaskStatus } from "./types.js";

export interface TaskPersistence {
    /** Identity of this run. Unique for the manager's lifetime; a re-run of the same slot gets a new one. */
    runId: RunId;
    /** The target this run intends to change. At most one run may own a slot at a time. */
    slotKey: string;
    type: string;
    params: unknown;
    phaseIndex: number;
    state: TaskState;
    externalId?: string;
    changeSet: ChangeEntry[];
    error?: string;
    /** Order in which runs retired. The only ordering key for history and eviction; never use `runId`. */
    retireSeq?: RetireSeq;
    revertRunId?: RunId;
    revertOf?: RunId;
}

/** How a run reads in a log or an error. A display convention, never an address. */
export function runLabel(runId: RunId): string {
    return `run #${runId}`;
}

/** Storage key for a run's record. Object keys must be strings; the run table holds nothing else. */
export function runKey(runId: RunId): string {
    return String(runId);
}

export abstract class Task<P = unknown> {
    abstract readonly type: string;
    abstract readonly phases: TaskPhase[];

    readonly runId: RunId;
    readonly slotKey: string;
    readonly params: P;

    /** Id the caller of `run` asked for this task under, so it can observe and cancel the work it asked for. */
    readonly externalId?: string;

    progress: { phaseIndex: number; state: TaskState };
    changeSet: ChangeEntry[];
    error?: string;
    retireSeq?: RetireSeq;
    revertRunId?: RunId;
    revertOf?: RunId;

    constructor(runId: RunId, slotKey: string, params: P, persisted?: Partial<TaskPersistence>) {
        this.runId = runId;
        this.slotKey = slotKey;
        this.params = params;
        this.externalId = persisted?.externalId;
        this.progress = { phaseIndex: persisted?.phaseIndex ?? 0, state: persisted?.state ?? "running" };
        this.changeSet = persisted?.changeSet ?? new Array<ChangeEntry>();
        this.error = persisted?.error;
        this.retireSeq = persisted?.retireSeq;
        this.revertRunId = persisted?.revertRunId;
        this.revertOf = persisted?.revertOf;
    }

    toString(): string {
        return runLabel(this.runId);
    }

    get status(): TaskStatus {
        return {
            runId: this.runId,
            slotKey: this.slotKey,
            type: this.type,
            state: this.progress.state,
            phaseIndex: this.progress.phaseIndex,
            externalId: this.externalId,
            error: this.error,
            retireSeq: this.retireSeq,
            revertRunId: this.revertRunId,
            revertOf: this.revertOf,
            detail: "full",
        };
    }

    /**
     * Whether cancel/failure may spawn a revert of this task's changeSet. False once a task passes a
     * point of no return whose forward effect cannot be rolled back; the manager then declines cancel and
     * suppresses auto-rollback.
     */
    get revertible(): boolean {
        return true;
    }

    /** Operator-facing reason a cancel is declined while {@link revertible} is false; overridden per task type. */
    get notRevertibleReason(): string {
        return "it has passed its point of no return";
    }

    /** Intents this task will create, derived from params, for pre-flight capacity admission. Removals omit. */
    plannedChanges(): PlannedChange[] {
        return new Array<PlannedChange>();
    }

    /**
     * The run this task undoes, if it is a rollback. A rollback rewrites the intents of that run, so it
     * contends for *that* run's slot rather than for its own, and the manager excludes it there.
     */
    static undoes(_params: unknown): RunId | undefined {
        return undefined;
    }

    /**
     * The target this task intends to change, derived from type and params. At most one non-terminal run may
     * exist per slot key. Subclasses override with their own key.
     */
    static slotKeyFor(_params: unknown): string {
        throw new ImplementationError("slotKeyFor must be implemented by the Task subclass");
    }

    toPersistence(): TaskPersistence {
        return {
            runId: this.runId,
            slotKey: this.slotKey,
            type: this.type,
            params: this.params,
            phaseIndex: this.progress.phaseIndex,
            state: this.progress.state,
            externalId: this.externalId,
            changeSet: this.changeSet,
            error: this.error,
            retireSeq: this.retireSeq,
            revertRunId: this.revertRunId,
            revertOf: this.revertOf,
        };
    }
}
