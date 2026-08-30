/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

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

/**
 * A run as anything may read it: a live run and a stored record both satisfy this.
 *
 * Definitions answer questions about runs through this view rather than through either concrete form, so
 * asking a live run a question never materialises its storage record, and asking a finished one never
 * rebuilds it as an object.
 */
export interface RunView {
    readonly runId: RunId;
    readonly slotKey: string;
    readonly type: string;
    readonly phaseIndex: number;
    readonly state: TaskState;
    readonly changeSet: readonly ChangeEntry[];
    readonly externalId?: string;
    readonly error?: string;
    readonly retireSeq?: RetireSeq;
    readonly revertRunId?: RunId;
    readonly revertOf?: RunId;
}

/**
 * What a type of work *is*: pure, immutable, and registered once.
 *
 * Deliberately separate from the run that executes it. A definition answers questions about work that has not
 * started — what target it claims, whether a caller may start it — and questions about work that has finished,
 * such as whether a retired record may still be rolled back. Welding those to an instance forced a finished
 * run to be rebuilt as an object before it could be asked anything.
 */
export interface TaskDefinition<P = unknown> {
    readonly type: string;

    /**
     * The target this work intends to change, derived from params. At most one non-terminal run may own a slot.
     */
    slotKeyFor(params: P): string;

    /** The phases one run of this work executes, in order. */
    phases(params: P): TaskPhase[];

    /**
     * Reject params this definition cannot interpret, throwing to say why.
     *
     * Called as a run is built, including when one is rebuilt from storage — which is the case that matters: a
     * record written by an older version of a task type may no longer make sense to it, and a definition that
     * says so leaves the run unresumed and visible rather than driving it on parameters it cannot honour.
     */
    validate?(params: P): void;

    /**
     * Whether a caller may start this type through `run`.
     *
     * A rollback is false: it exists to undo a specific run, and only the manager knows that run's driver has
     * been stopped first. A caller able to conjure one could start it against work still in flight.
     */
    readonly callerCreatable?: boolean;

    /**
     * The run this work undoes, if it is a rollback. A rollback rewrites the intents of that run, so it
     * contends for *that* run's slot rather than for its own, and the manager excludes it there.
     */
    undoes?(params: P): RunId | undefined;

    /** Intents this work will create, derived from params, for pre-flight capacity admission. Removals omit. */
    plannedChanges?(params: P): PlannedChange[];

    /**
     * Whether cancel or failure may roll back the given run of this work. False once a run passes a point of no
     * return whose forward effect cannot be undone; the manager then declines cancel and suppresses
     * auto-rollback.
     *
     * Answered from the record rather than from a live object, so a run that finished before this start can be
     * asked the same question.
     */
    revertible?(run: RunView, params: P): boolean;

    /** Operator-facing reason a cancel is declined while {@link revertible} is false. */
    readonly notRevertibleReason?: string;
}

/** One run of a {@link TaskDefinition}: its identity, its parameters and how far it has got. */
export class Task<P = unknown> implements RunView {
    readonly definition: TaskDefinition<P>;
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

    #phases?: TaskPhase[];

    constructor(
        definition: TaskDefinition<P>,
        runId: RunId,
        slotKey: string,
        params: P,
        persisted?: Partial<TaskPersistence>,
    ) {
        definition.validate?.(params);
        this.definition = definition;
        this.runId = runId;
        this.slotKey = slotKey;
        this.params = params;
        this.externalId = persisted?.externalId;
        this.progress = { phaseIndex: persisted?.phaseIndex ?? 0, state: persisted?.state ?? "running" };
        this.changeSet = persisted?.changeSet ?? new Array<ChangeEntry>();
        this.error = persisted?.error;
        this.retireSeq = persisted?.retireSeq;
        this.revertRunId = persisted?.revertRunId;
        this.revertOf = persisted?.revertOf ?? definition.undoes?.(params);
    }

    get type(): string {
        return this.definition.type;
    }

    get phaseIndex(): number {
        return this.progress.phaseIndex;
    }

    get state(): TaskState {
        return this.progress.state;
    }

    /** Built once: a driver indexes into this list across phases and must see one stable set. */
    get phases(): TaskPhase[] {
        return (this.#phases ??= this.definition.phases(this.params));
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
