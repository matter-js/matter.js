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

/** Reason a cancel is declined when a definition states none of its own. */
export const NOT_REVERTIBLE_REASON = "it has passed its point of no return";

/**
 * One run, in one shape, whatever phase it is in.
 *
 * Mutable, and one object identity for the run's lifetime: a handle closes over the record it was given and
 * keeps answering as the run changes, and nothing replaces a record with a fresh copy that leaves earlier
 * readers behind.
 */
export class RunRecord implements RunView {
    readonly runId: RunId;
    readonly slotKey: string;
    readonly type: string;
    readonly externalId?: string;

    params: unknown;
    phaseIndex: number;
    state: TaskState;
    changeSet: ChangeEntry[];
    error?: string;
    retireSeq?: RetireSeq;
    revertRunId?: RunId;
    revertOf?: RunId;

    constructor(runId: RunId, slotKey: string, type: string, params: unknown, persisted?: Partial<TaskPersistence>) {
        this.runId = runId;
        this.slotKey = slotKey;
        this.type = type;
        this.params = params;
        this.externalId = persisted?.externalId;
        this.phaseIndex = persisted?.phaseIndex ?? 0;
        this.state = persisted?.state ?? "running";
        this.changeSet = persisted?.changeSet ?? new Array<ChangeEntry>();
        this.error = persisted?.error;
        this.retireSeq = persisted?.retireSeq;
        this.revertRunId = persisted?.revertRunId;
        this.revertOf = persisted?.revertOf;
    }

    static fromPersistence(record: TaskPersistence): RunRecord {
        return new RunRecord(record.runId, record.slotKey, record.type, record.params, record);
    }

    /**
     * A snapshot for storage.
     *
     * `changeSet` is copied rather than shared: a snapshot taken for one write would otherwise alias an array a
     * running phase appends to, and the write would carry entries it never intended.
     */
    toPersistence(): TaskPersistence {
        return {
            runId: this.runId,
            slotKey: this.slotKey,
            type: this.type,
            params: this.params,
            phaseIndex: this.phaseIndex,
            state: this.state,
            externalId: this.externalId,
            changeSet: [...this.changeSet],
            error: this.error,
            retireSeq: this.retireSeq,
            revertRunId: this.revertRunId,
            revertOf: this.revertOf,
        };
    }
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
 * Separate from the run that executes it, because it answers questions about work that has not started — what
 * target it claims, whether a caller may start it — and about work that has finished, such as whether a retired
 * record may still be rolled back. Neither has a run to be asked of.
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

/**
 * A definition together with parameters it has accepted.
 *
 * Parameters reach this layer untyped — from a caller, and from storage where an older version of a task type
 * may have written them — while a definition's members are declared for its own parameter type. Constructing
 * this is the single point at which the one becomes the other, and the only point that may refuse. Nothing
 * below asks a definition anything about parameters it has not accepted, because there is no other way to
 * reach it.
 */
export class BoundDefinition<P = unknown> {
    readonly definition: TaskDefinition<P>;
    readonly params: P;

    get type(): string {
        return this.definition.type;
    }

    constructor(definition: TaskDefinition<P>, params: P) {
        definition.validate?.(params);
        this.definition = definition;
        this.params = params;
    }

    get slotKey(): string {
        return this.definition.slotKeyFor(this.params);
    }

    get callerCreatable(): boolean {
        return this.definition.callerCreatable ?? true;
    }

    get undoes(): RunId | undefined {
        return this.definition.undoes?.(this.params);
    }

    get notRevertibleReason(): string {
        return this.definition.notRevertibleReason ?? NOT_REVERTIBLE_REASON;
    }

    plannedChanges(): PlannedChange[] {
        return this.definition.plannedChanges?.(this.params) ?? new Array<PlannedChange>();
    }

    revertible(run: RunView): boolean {
        return this.definition.revertible?.(run, this.params) ?? true;
    }

    phases(): TaskPhase[] {
        return this.definition.phases(this.params);
    }
}

/**
 * A run this process has instantiated: its record, and the definition bound to the params that record carries.
 *
 * Holds no state of its own — every field lives on the record, so there is one in-memory shape for a run
 * whether or not this process is driving it.
 */
export class Task<P = unknown> implements RunView {
    readonly bound: BoundDefinition<P>;
    readonly record: RunRecord;

    #phases?: TaskPhase[];

    constructor(bound: BoundDefinition<P>, record: RunRecord) {
        this.bound = bound;
        this.record = record;
        this.record.revertOf ??= bound.undoes;
    }

    get definition(): TaskDefinition<P> {
        return this.bound.definition;
    }

    get params(): P {
        return this.bound.params;
    }

    get runId(): RunId {
        return this.record.runId;
    }

    get slotKey(): string {
        return this.record.slotKey;
    }

    get type(): string {
        return this.record.type;
    }

    get externalId(): string | undefined {
        return this.record.externalId;
    }

    /** The record, under the name the driver reads it by. Mutating this mutates the run. */
    get progress(): RunRecord {
        return this.record;
    }

    get phaseIndex(): number {
        return this.record.phaseIndex;
    }

    get state(): TaskState {
        return this.record.state;
    }

    get changeSet(): ChangeEntry[] {
        return this.record.changeSet;
    }

    get error(): string | undefined {
        return this.record.error;
    }

    set error(value: string | undefined) {
        this.record.error = value;
    }

    get retireSeq(): RetireSeq | undefined {
        return this.record.retireSeq;
    }

    set retireSeq(value: RetireSeq | undefined) {
        this.record.retireSeq = value;
    }

    get revertRunId(): RunId | undefined {
        return this.record.revertRunId;
    }

    set revertRunId(value: RunId | undefined) {
        this.record.revertRunId = value;
    }

    get revertOf(): RunId | undefined {
        return this.record.revertOf;
    }

    /**
     * Whether this run may still be rolled back, answered by the definition it was built with.
     *
     * Resolving the type again would let a definition registered after this run started decide a question its
     * own definition already answered.
     */
    get revertible(): boolean {
        return this.bound.revertible(this.record);
    }

    get notRevertibleReason(): string {
        return this.bound.notRevertibleReason;
    }

    /** Built once: a driver indexes into this list across phases and must see one stable set. */
    get phases(): TaskPhase[] {
        return (this.#phases ??= this.bound.phases());
    }

    toString(): string {
        return runLabel(this.runId);
    }

    get status(): TaskStatus {
        return statusOf(this.record);
    }

    toPersistence(): TaskPersistence {
        return this.record.toPersistence();
    }
}

/** How a run reads to a caller, from its record alone. */
export function statusOf(record: RunView): TaskStatus {
    return {
        runId: record.runId,
        slotKey: record.slotKey,
        type: record.type,
        state: record.state,
        phaseIndex: record.phaseIndex,
        externalId: record.externalId,
        error: record.error,
        retireSeq: record.retireSeq,
        revertRunId: record.revertRunId,
        revertOf: record.revertOf,
        detail: "full",
    };
}
