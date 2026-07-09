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
    externalId?: string;
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
    readonly externalId?: string;
    progress: { phaseIndex: number; state: TaskState };
    changeSet: ChangeEntry[];
    error?: string;
    revertTaskId?: string;
    revertOf?: string;

    constructor(id: string, params: P, persisted?: Partial<TaskPersistence>) {
        this.id = id;
        this.params = params;
        this.externalId = persisted?.externalId;
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
            externalId: this.externalId,
            error: this.error,
            revertTaskId: this.revertTaskId,
            revertOf: this.revertOf,
        };
    }

    /** Intents this task will create, derived from params, for pre-flight capacity admission. Removals omit. */
    plannedChanges(): PlannedChange[] {
        return new Array<PlannedChange>();
    }

    /** Deterministic internal id from type + params. Subclasses override with their own key. */
    static idFor(_params: unknown): string {
        throw new ImplementationError("idFor must be implemented by the Task subclass");
    }

    toPersistence(): TaskPersistence {
        return {
            type: this.type,
            params: this.params,
            phaseIndex: this.progress.phaseIndex,
            state: this.progress.state,
            externalId: this.externalId,
            changeSet: this.changeSet,
            error: this.error,
            revertTaskId: this.revertTaskId,
            revertOf: this.revertOf,
        };
    }
}
