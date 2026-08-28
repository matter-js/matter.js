/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { runKey, Task, TaskPersistence } from "./Task.js";
import { RetireSeq, RunId, TaskState } from "./types.js";

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set<TaskState>(["completed", "failed", "cancelled"]);

/** Whether a persisted record has reached a state no driver will advance. */
export function isTerminal(state: TaskState): boolean {
    return TERMINAL_STATES.has(state);
}

export interface RunStoreSnapshot {
    runs: Record<string, TaskPersistence>;
    nextRunId: number;
    nextRetireSeq: number;
}

/**
 * The run table: identity allocation, the live slot index, retired records and tombstones.
 *
 * Deliberately free of any dependency on a node, a gate or a clock, so the invariants that four review rounds
 * kept breaking — allocation monotonicity, one owner per slot, ordering by retirement rather than by start —
 * are testable without driving a task. The manager owns persistence and calls {@link snapshot} to write.
 */
export class RunStore {
    #nextRunId = 1;
    #nextRetireSeq = 1;
    readonly #live = new Map<RunId, Task>();
    readonly #slots = new Map<string, RunId>();
    readonly #retired = new Map<RunId, TaskPersistence>();

    /**
     * Load persisted state. `externalId` is not persisted as an index of its own: it is derived from the
     * records that carry it, so it cannot drift from them.
     */
    load(snapshot: Partial<RunStoreSnapshot> | undefined): { resumable: TaskPersistence[]; discarded: number } {
        const resumable = new Array<TaskPersistence>();
        let discarded = 0;
        let highest = 0;

        for (const record of Object.values(snapshot?.runs ?? {})) {
            // Pre-runId records name their slot where a runId now goes; they cannot be resumed under an
            // identity they never had.
            if (typeof record?.runId !== "number") {
                discarded++;
                continue;
            }
            highest = Math.max(highest, record.runId);
            if (isTerminal(record.state)) {
                this.#retired.set(record.runId, record);
            } else {
                resumable.push(record);
            }
        }
        // The persisted counter is a high-water mark, so it is authoritative where present; seeding above the
        // highest surviving id covers a store whose counter predates this scheme.
        this.#nextRunId = Math.max(snapshot?.nextRunId ?? 1, highest + 1);
        this.#nextRetireSeq = Math.max(
            snapshot?.nextRetireSeq ?? 1,
            ...[...this.#retired.values()].map(r => (r.retireSeq ?? 0) + 1),
        );
        return { resumable, discarded };
    }

    get nextRunId(): number {
        return this.#nextRunId;
    }

    get nextRetireSeq(): number {
        return this.#nextRetireSeq;
    }

    /** Claim the next identity. Callers allocate only after a request has passed admission. */
    allocate(): RunId {
        return RunId(this.#nextRunId++);
    }

    /** The run that currently owns `slotKey`, if any. */
    ownerOf(slotKey: string): Task | undefined {
        const runId = this.#slots.get(slotKey);
        return runId === undefined ? undefined : this.#live.get(runId);
    }

    /** Register a run as live and give it ownership of its slot. */
    admit(task: Task): void {
        const owner = this.#slots.get(task.slotKey);
        if (owner !== undefined && owner !== task.runId) {
            throw new ImplementationError(
                `Run ${task.runId} cannot take slot ${task.slotKey}: run ${owner} still owns it`,
            );
        }
        this.#live.set(task.runId, task);
        this.#slots.set(task.slotKey, task.runId);
    }

    /**
     * Stamp a settled run's place in the retirement order, without moving it. Retirement is only real once the
     * record carrying it is durable, so the caller writes first and then {@link commitRetirement}: nothing but
     * this one field is staged, and {@link abandonRetirement} undoes it if the write is refused.
     */
    stampRetirement(task: Task): void {
        if (this.#live.has(task.runId) && task.retireSeq === undefined) {
            task.retireSeq = RetireSeq(this.#nextRetireSeq++);
        }
    }

    /** Hand back a stamped run's slot and move its record to the retired tier. */
    commitRetirement(task: Task): void {
        if (!this.#live.has(task.runId)) {
            return;
        }
        this.#live.delete(task.runId);
        if (this.#slots.get(task.slotKey) === task.runId) {
            this.#slots.delete(task.slotKey);
        }
        this.#retired.set(task.runId, task.toPersistence());
    }

    /** Drop a retirement whose record never landed. The run keeps its slot and stays exactly as it was. */
    abandonRetirement(task: Task): void {
        task.retireSeq = undefined;
    }

    /** Re-read a retired run's record from its task, for a change made after it retired. */
    refresh(task: Task): void {
        if (this.#retired.has(task.runId)) {
            this.#retired.set(task.runId, task.toPersistence());
        }
    }

    /** Forget a run that was never persisted, so a refused write leaves nothing for a later resume to find. */
    discard(task: Task): void {
        this.#live.delete(task.runId);
        if (this.#slots.get(task.slotKey) === task.runId) {
            this.#slots.delete(task.slotKey);
        }
    }

    get live(): Task[] {
        return [...this.#live.values()];
    }

    isLive(runId: RunId): boolean {
        return this.#live.has(runId);
    }

    liveRun(runId: RunId): Task | undefined {
        return this.#live.get(runId);
    }

    /** Retired records, newest retirement first. Ordered by `retireSeq`, never by `runId` or insertion. */
    get retired(): TaskPersistence[] {
        return [...this.#retired.values()].sort((a, b) => (b.retireSeq ?? 0) - (a.retireSeq ?? 0));
    }

    retiredRun(runId: RunId): TaskPersistence | undefined {
        return this.#retired.get(runId);
    }

    /** The run a caller-supplied external id names, preferring a live holder over a retired one. */
    findByExternalId(externalId: string): { runId: RunId; live?: Task } | undefined {
        for (const task of this.#live.values()) {
            if (task.externalId === externalId) {
                return { runId: task.runId, live: task };
            }
        }
        let newest: TaskPersistence | undefined;
        for (const record of this.retired) {
            if (
                record.externalId === externalId &&
                (newest === undefined || (record.retireSeq ?? 0) > (newest.retireSeq ?? 0))
            ) {
                newest = record;
            }
        }
        if (newest !== undefined) {
            return { runId: newest.runId };
        }
        return undefined;
    }

    /** A live run holding `externalId` whose slot is not `slotKey`, which no request may take that name from. */
    conflictingExternalIdHolder(externalId: string, slotKey: string): Task | undefined {
        for (const task of this.#live.values()) {
            if (task.externalId === externalId && task.slotKey !== slotKey) {
                return task;
            }
        }
        return undefined;
    }

    /**
     * A live rollback of any retired run of `slotKey`. A rollback rewrites exactly the intents a re-run would
     * re-apply, so the two must never overlap — and the rollback in flight is not necessarily undoing the most
     * recent run of the slot.
     */
    pendingRevertOfSlot(slotKey: string): Task | undefined {
        const undone = new Set<RunId>();
        for (const [runId, record] of this.#retired) {
            if (record.slotKey === slotKey) {
                undone.add(runId);
            }
        }
        for (const task of this.#live.values()) {
            if (task.revertOf !== undefined && undone.has(task.revertOf)) {
                return task;
            }
        }
        return undefined;
    }

    snapshot(): RunStoreSnapshot {
        const runs: Record<string, TaskPersistence> = {};
        for (const task of this.#live.values()) {
            runs[runKey(task.runId)] = task.toPersistence();
        }
        for (const [runId, record] of this.#retired) {
            runs[runKey(runId)] = record;
        }
        return { runs, nextRunId: this.#nextRunId, nextRetireSeq: this.#nextRetireSeq };
    }
}
