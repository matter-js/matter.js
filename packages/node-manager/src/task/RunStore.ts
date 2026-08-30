/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { TaskIdentityExhaustedError } from "./errors.js";
import { runKey, Task, TaskPersistence } from "./Task.js";
import { RetireSeq, RunId, TaskState } from "./types.js";

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set<TaskState>(["completed", "failed", "cancelled"]);

/** Whether a persisted record has reached a state no driver will advance. */
export function isTerminal(state: TaskState): boolean {
    return TERMINAL_STATES.has(state);
}

/**
 * How far ahead of itself the identity counter is persisted.
 *
 * `run()` is synchronous, so a run's identity is handed out before any write. Persisting the counter this far
 * ahead means an identity is already durable when it is issued, and a process that stops before the run's
 * first record lands cannot re-issue it to unrelated work. The cost is that a restart abandons whatever is
 * left of the block, so identities are sparse rather than consecutive.
 */
export const RUN_ID_RESERVATION = 64;

export interface RunStoreSnapshot {
    runs: Record<string, TaskPersistence>;
    nextRunId: number;
    nextRetireSeq: number;
}

/**
 * The run table: identity allocation, the live slot index and retired records.
 *
 * Deliberately free of any dependency on a node, a gate or a clock, so its invariants — allocation
 * monotonicity, one owner per slot, ordering by retirement rather than by start — are testable without
 * driving a task. The manager owns persistence and calls {@link snapshot} to write.
 */
export class RunStore {
    #nextRunId = 1;
    /**
     * Identities below this are durable. Advanced only by {@link noteReserved}, which the manager calls once
     * the write carrying the counter has landed — never before it, or a refused write leaves a boundary
     * standing that storage does not back and the next start re-issues everything beyond it.
     */
    #reservedBelow = 1;
    #nextRetireSeq = 1;
    readonly #live = new Map<RunId, Task>();
    readonly #slots = new Map<string, RunId>();
    readonly #retired = new Map<RunId, TaskPersistence>();
    /**
     * Persisted non-terminal runs this start has not instantiated yet, because nothing has registered their
     * type. They are work in progress, so they answer lookups and hold their slot: a record that were invisible
     * could have its slot taken by new work and would then never resume, orphaning the intents it already wrote.
     */
    readonly #pending = new Map<RunId, TaskPersistence>();

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
            // A terminal record carries its place in the retirement order, because the write that records an
            // outcome stamps it. One without is from a build that wrote the outcome and the order separately;
            // it has no position, so it would sort ahead of every sequenced run of its slot and let an older
            // run's rollback overwrite it.
            if (isTerminal(record.state) && record.retireSeq === undefined) {
                discarded++;
                continue;
            }
            if (isTerminal(record.state)) {
                this.#retired.set(record.runId, record);
            } else {
                this.#pending.set(record.runId, record);
                resumable.push(record);
            }
        }
        // The persisted counter is a high-water mark, so it is authoritative where present; seeding above the
        // highest surviving id covers a store whose counter predates this scheme.
        this.#nextRunId = Math.max(snapshot?.nextRunId ?? 1, highest + 1);
        // Whatever the last start persisted is what is durable; anything beyond it must be reserved again.
        this.#reservedBelow = Math.max(snapshot?.nextRunId ?? 1, this.#nextRunId);
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

    /**
     * Claim the next identity. Callers allocate only after a request has passed admission.
     *
     * Refuses rather than hand out an identity the last write did not cover: an unreserved identity is one the
     * next start can give to different work, which is the whole hazard the reservation exists to remove.
     */
    allocate(): RunId {
        if (this.#nextRunId >= this.#reservedBelow) {
            throw new TaskIdentityExhaustedError(
                `No durable run identity available: ${this.#nextRunId} is beyond the reservation ${this.#reservedBelow}. Retry once a record has been written.`,
            );
        }
        return RunId(this.#nextRunId++);
    }

    /** Note that a reservation is now durable, so identities below it may be issued. */
    noteReserved(through: number): void {
        this.#reservedBelow = Math.max(this.#reservedBelow, through);
    }

    /** The counter as it must be recorded to cover the identities this store will hand out next. */
    get reservedRunId(): number {
        return this.#nextRunId + RUN_ID_RESERVATION;
    }

    /** The run that currently owns `slotKey`, if any. */
    ownerOf(slotKey: string): Task | undefined {
        const runId = this.#slots.get(slotKey);
        return runId === undefined ? undefined : this.#live.get(runId);
    }

    /** A persisted run awaiting resume that holds `slotKey`. */
    pendingOwnerOf(slotKey: string): TaskPersistence | undefined {
        for (const record of this.#pending.values()) {
            if (record.slotKey === slotKey) {
                return record;
            }
        }
        return undefined;
    }

    /** Records awaiting resume, in ascending runId — the only order defined for resume. */
    get pending(): TaskPersistence[] {
        return [...this.#pending.values()].sort((a, b) => a.runId - b.runId);
    }

    /** Take a record out of the pending tier once resume has decided what to do with it. */
    resolvePending(runId: RunId): void {
        this.#pending.delete(runId);
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
     * Stamp a settled run's place in the retirement order, without moving it.
     *
     * Called as the state becomes terminal, so the write that records the outcome carries the order with it. A
     * terminal record that reached storage without one would sort ahead of every sequenced run of its slot, and
     * {@link supersederOf} would then let an older run's rollback overwrite it.
     *
     * {@link abandonRetirement} undoes the stamp if that write is refused, and {@link commitRetirement} hands
     * back the slot once it lands.
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

    pendingRun(runId: RunId): TaskPersistence | undefined {
        return this.#pending.get(runId);
    }

    /** The run a caller-supplied external id names, preferring a live holder over a retired one. */
    findByExternalId(externalId: string): { runId: RunId; live?: Task } | undefined {
        for (const task of this.#live.values()) {
            if (task.externalId === externalId) {
                return { runId: task.runId, live: task };
            }
        }
        // Before retired records: a run awaiting resume is unfinished work, and its name still belongs to it.
        for (const record of this.#pending.values()) {
            if (record.externalId === externalId) {
                return { runId: record.runId };
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

    /**
     * A run holding `externalId` whose slot is not `slotKey`, which no request may take that name from.
     *
     * Includes runs awaiting resume: they are unfinished work whose name still belongs to them, and letting a
     * different slot take it would leave the resumed run answering to nothing.
     */
    conflictingExternalIdHolder(externalId: string, slotKey: string): { runId: RunId; slotKey: string } | undefined {
        for (const task of this.#live.values()) {
            if (task.externalId === externalId && task.slotKey !== slotKey) {
                return task;
            }
        }
        for (const record of this.#pending.values()) {
            if (record.externalId === externalId && record.slotKey !== slotKey) {
                return record;
            }
        }
        return undefined;
    }

    /**
     * A retired run of the same slot that finished after `runId`, if there is one.
     *
     * Undoing a run restores the values it found, so a later run of the same slot having since committed its
     * own makes those values historical: applying them would overwrite an outcome nobody asked to undo.
     */
    supersederOf(runId: RunId): TaskPersistence | undefined {
        const record = this.#retired.get(runId);
        if (record === undefined) {
            return undefined;
        }
        const retiredAt = record.retireSeq ?? 0;
        for (const other of this.#retired.values()) {
            if (other.slotKey === record.slotKey && (other.retireSeq ?? 0) > retiredAt) {
                return other;
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
        for (const [runId, record] of this.#pending) {
            runs[runKey(runId)] = record;
        }
        return { runs, nextRunId: this.#nextRunId, nextRetireSeq: this.#nextRetireSeq };
    }
}
