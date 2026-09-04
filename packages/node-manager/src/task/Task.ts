/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/general";
import { ChangeEntry, PlannedChange, RetireSeq, RunId, TaskPhase, TaskState, TaskStatus } from "./types.js";

export interface TaskPersistence {
    /** Identity of this run. Unique for the manager's lifetime; a re-run of the same slot gets a new one. */
    runId: RunId;
    /** The target this run intends to change. At most one run may own a slot at a time. */
    slotKey: string;
    type: string;
    /**
     * Absent once the run is terminal: params exist to re-drive phases on resume, and some carry raw key
     * material that must not outlive the work.
     */
    params?: unknown;
    phaseIndex: number;
    state: TaskState;
    externalId?: string;
    changeSet: ChangeEntry[];
    error?: string;
    /** Order in which runs retired. The only ordering key for history; never use `runId`. */
    retireSeq?: RetireSeq;
    revertRunId?: RunId;
    revertOf?: RunId;
}

/**
 * Fields a write may remove outright, as opposed to leaving unchanged.
 *
 * One member today because `params` is the only thing a retirement stops carrying. Retention of the values a
 * rollback would restore is decided per *target* rather than per run, so what else becomes droppable belongs
 * with that.
 */
export type DroppableField = "params";

/**
 * Fields a record may legitimately not have. Enumerated rather than derived from the values present, so the
 * strip cannot reach a required field: `params` is typed `unknown`, which widens the indexed type enough that
 * deleting `runId` or `state` would type-check.
 */
const OPTIONAL_FIELDS = ["params", "externalId", "error", "retireSeq", "revertRunId", "revertOf"] as const;

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

    /**
     * Whether any write of this run has landed. Until one has, the run exists only in this process — a property
     * of the run rather than of an attempt to drive it, so re-driving one does not forget that it is durable.
     */
    recorded = false;

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
        const loaded = new RunRecord(record.runId, record.slotKey, record.type, record.params, record);
        loaded.recorded = true;
        return loaded;
    }

    /**
     * A snapshot for storage, optionally carrying state this run has not adopted yet, and fields the write
     * removes outright.
     *
     * The one place a snapshot is produced, so what a write carries and what an observer sees are the same
     * thing. `changeSet` is copied rather than shared: a snapshot taken for one write would otherwise alias an
     * array a running phase appends to, and the write would carry entries it never intended.
     */
    toPersistence(next?: Partial<TaskPersistence>, drop?: ReadonlyArray<DroppableField>): TaskPersistence {
        const persisted: TaskPersistence = {
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
        // Only what `next` actually carries: a field it leaves undefined means "unchanged", and spreading it
        // would erase the value the run already holds. Clearing a field is not expressible, and nothing needs
        // it — a transition that must remove something says so with a value.
        for (const [key, value] of Object.entries(next ?? {})) {
            if (value !== undefined) {
                Object.assign(persisted, { [key]: value });
            }
        }
        // Removal is a separate list for that reason: `undefined` in `next` cannot express it.
        for (const field of drop ?? []) {
            // A write that both sets a field and removes it has two intentions for one field, and the order
            // the two lists are applied in would decide silently which wins.
            if (next?.[field] !== undefined) {
                throw new InternalError(
                    `${runLabel(this.runId)}: write both sets and drops "${field}"; a field is one or the other`,
                );
            }
            delete persisted[field];
        }
        // A field the run does not have is absent, not present holding `undefined`. Otherwise a write that
        // drops a field removes the key and the *next* write of the same record puts it back empty, so
        // "storage omits it" would hold for exactly one write.
        for (const key of OPTIONAL_FIELDS) {
            if (persisted[key] === undefined) {
                delete persisted[key];
            }
        }
        return persisted;
    }

    /** Apply a write's removals to the in-memory run, once that write has landed. */
    adoptDrop(drop: ReadonlyArray<DroppableField>): void {
        for (const field of drop) {
            switch (field) {
                case "params":
                    this.params = undefined;
                    break;
                default:
                    // A field storage drops that memory does not is the drift no assertion would catch, and a
                    // `switch` with neither this arm nor a `never` check compiles happily when a member is
                    // added.
                    throw new InternalError(`${runLabel(this.runId)}: no in-memory removal for "${field}"`);
            }
        }
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
    };
}
