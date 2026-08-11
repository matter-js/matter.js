/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { ChangeEntry, PlannedChange, TaskPhase, TaskState, TaskStatus } from "./types.js";

export interface TaskPersistence {
    type: string;
    params: unknown;
    phaseIndex: number;
    state: TaskState;
    externalIds?: string[];
    changeSet: ChangeEntry[];
    error?: string;
    revertTaskId?: string;
    revertOf?: string;
}

export abstract class Task<P = unknown> {
    abstract readonly type: string;
    abstract readonly phases: TaskPhase[];

    readonly id: string;
    readonly params: P;

    /**
     * Ids callers use to find this task instead of its internal id. Every request that dedups onto the task
     * contributes its own, so each caller can observe and cancel the work it asked for.
     */
    readonly externalIds: Set<string>;

    progress: { phaseIndex: number; state: TaskState };
    changeSet: ChangeEntry[];
    error?: string;
    revertTaskId?: string;
    revertOf?: string;

    constructor(id: string, params: P, persisted?: Partial<TaskPersistence>) {
        this.id = id;
        this.params = params;
        this.externalIds = new Set(persisted?.externalIds);
        this.progress = { phaseIndex: persisted?.phaseIndex ?? 0, state: persisted?.state ?? "running" };
        this.changeSet = persisted?.changeSet ?? new Array<ChangeEntry>();
        this.error = persisted?.error;
        this.revertTaskId = persisted?.revertTaskId;
        this.revertOf = persisted?.revertOf;
    }

    get status(): TaskStatus {
        return {
            type: this.type,
            state: this.progress.state,
            phaseIndex: this.progress.phaseIndex,
            externalIds: [...this.externalIds],
            error: this.error,
            revertTaskId: this.revertTaskId,
            revertOf: this.revertOf,
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

    /** Deterministic internal id from type + params. Subclasses override with their own key. */
    static idFor(_params: unknown): string {
        throw new ImplementationError("idFor must be implemented by the Task subclass");
    }

    /**
     * While a task is live and non-terminal, no other task sharing the same non-undefined resourceKey may start —
     * mutual exclusion over a resource the reconciler cannot let two tasks mutate concurrently. Default undefined =
     * no exclusivity.
     */
    resourceKey(): string | undefined {
        return undefined;
    }

    toPersistence(): TaskPersistence {
        return {
            type: this.type,
            params: this.params,
            phaseIndex: this.progress.phaseIndex,
            state: this.progress.state,
            externalIds: this.externalIds.size === 0 ? undefined : [...this.externalIds],
            changeSet: this.changeSet,
            error: this.error,
            revertTaskId: this.revertTaskId,
            revertOf: this.revertOf,
        };
    }
}
