/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { TaskIdentityExhaustedError } from "./errors.js";
import { Execution } from "./Execution.js";
import { runKey, RunRecord, TaskPersistence } from "./Task.js";
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

    /** Every run this process knows, in every phase. One table, so no verb can look in the wrong one. */
    readonly #records = new Map<RunId, RunRecord>();

    /**
     * Runs this process is responsible for. A record without one is awaiting resume: unfinished work whose
     * type nothing has registered yet, or whose node is not online. It still holds its slot, because a record
     * that were invisible could have its slot taken by new work and would then never resume, orphaning the
     * intents it already wrote.
     */
    readonly #executions = new Map<RunId, Execution>();

    /**
     * Who owns each slot. Maintained rather than derived: a slot is released at the retirement commit, and
     * "committed" is not a record field — deriving from `!isTerminal` would release it the moment an outcome
     * is assigned, which is the window a rollback's admission occupies.
     */
    readonly #slots = new Map<string, RunId>();

    /**
     * Load persisted state. `externalId` is not persisted as an index of its own: it is derived from the
     * records that carry it, so it cannot drift from them.
     */
    load(snapshot: Partial<RunStoreSnapshot> | undefined): { resumable: RunRecord[]; discarded: number } {
        const resumable = new Array<RunRecord>();
        let discarded = 0;
        let highest = 0;

        for (const stored of Object.values(snapshot?.runs ?? {})) {
            // Pre-runId records name their slot where a runId now goes; they cannot be resumed under an
            // identity they never had.
            if (typeof stored?.runId !== "number") {
                discarded++;
                continue;
            }
            highest = Math.max(highest, stored.runId);
            // A terminal record carries its place in the retirement order, because the write that records an
            // outcome stamps it. One without is from a build that wrote the outcome and the order separately;
            // it has no position, so it would sort ahead of every sequenced run of its slot and let an older
            // run's rollback overwrite it.
            if (isTerminal(stored.state) && stored.retireSeq === undefined) {
                discarded++;
                continue;
            }
            const record = RunRecord.fromPersistence(stored);
            this.#records.set(record.runId, record);
            if (!isTerminal(record.state)) {
                this.#slots.set(record.slotKey, record.runId);
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
            ...[...this.#records.values()].map(r => (r.retireSeq ?? 0) + 1),
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

    /** Every run, whatever phase it is in. */
    get(runId: RunId): RunRecord | undefined {
        return this.#records.get(runId);
    }

    /** This process's responsibility for `runId`, if it has one. */
    executionOf(runId: RunId): Execution | undefined {
        return this.#executions.get(runId);
    }

    /** Whether this process is responsible for `runId` rather than merely holding its record. */
    isAttached(runId: RunId): boolean {
        return this.#executions.has(runId);
    }

    /** Every run this process is responsible for. */
    get executions(): Execution[] {
        return [...this.#executions.values()];
    }

    /** The run that owns `slotKey`, driving or awaiting resume. */
    ownerOf(slotKey: string): RunRecord | undefined {
        const runId = this.#slots.get(slotKey);
        return runId === undefined ? undefined : this.#records.get(runId);
    }

    /** Runs that own a slot: unfinished work, plus work whose retirement has not yet been recorded. */
    get live(): RunRecord[] {
        return [...this.#slots.values()].flatMap(runId => {
            const record = this.#records.get(runId);
            return record === undefined ? [] : [record];
        });
    }

    /** Records awaiting resume, in ascending runId — the only order defined for resume. */
    get resumable(): RunRecord[] {
        return [...this.#records.values()]
            .filter(record => !isTerminal(record.state) && !this.#executions.has(record.runId))
            .sort((a, b) => a.runId - b.runId);
    }

    /** Retired records, newest retirement first. Ordered by `retireSeq`, never by `runId` or insertion. */
    get retired(): RunRecord[] {
        return (
            [...this.#records.values()]
                // Only the run that still owns the slot is excluded, not every terminal run that ever held it: a
                // re-run of a slot would otherwise hide its own history for as long as it is live.
                .filter(record => isTerminal(record.state) && this.#slots.get(record.slotKey) !== record.runId)
                .sort((a, b) => (b.retireSeq ?? 0) - (a.retireSeq ?? 0))
        );
    }

    /**
     * The run a caller's own id names.
     *
     * One table needs the preference the tiers used to imply: unfinished work answers over finished work,
     * because its name still belongs to it, and among finished runs the one that retired most recently.
     */
    findByExternalId(externalId: string): RunRecord | undefined {
        let newestRetired: RunRecord | undefined;
        for (const record of this.#records.values()) {
            if (record.externalId !== externalId) {
                continue;
            }
            if (!isTerminal(record.state)) {
                return record;
            }
            if (newestRetired === undefined || (record.retireSeq ?? 0) > (newestRetired.retireSeq ?? 0)) {
                newestRetired = record;
            }
        }
        return newestRetired;
    }

    /** A run holding `externalId` that a request for `slotKey` may not take it from. */
    conflictingExternalIdHolder(externalId: string, slotKey: string): RunRecord | undefined {
        const holder = this.findByExternalId(externalId);
        return holder !== undefined && holder.slotKey !== slotKey && !isTerminal(holder.state) ? holder : undefined;
    }

    /** Register a run and give it ownership of its slot. In memory only: nothing is durable yet. */
    admit(record: RunRecord, execution?: Execution): void {
        const owner = this.#slots.get(record.slotKey);
        if (owner !== undefined && owner !== record.runId) {
            throw new ImplementationError(
                `Run ${record.runId} cannot take slot ${record.slotKey}: run ${owner} still owns it`,
            );
        }
        this.#records.set(record.runId, record);
        this.#slots.set(record.slotKey, record.runId);
        if (execution !== undefined) {
            this.#executions.set(record.runId, execution);
        }
    }

    /** Take responsibility for a record this store already holds. */
    attach(execution: Execution): void {
        // Identity, not merely presence: an execution over a record the table replaced would write a run's
        // progress into an object nothing else reads.
        if (this.#records.get(execution.runId) !== execution.record) {
            throw new ImplementationError(`Run ${execution.runId} has no record to drive`);
        }
        this.#executions.set(execution.runId, execution);
    }

    /** Give up responsibility without retiring — a run left for the next start. */
    detach(runId: RunId): void {
        this.#executions.delete(runId);
    }

    /**
     * The place in the retirement order this run would take, or `undefined` if it is not the slot's owner or
     * already has one.
     *
     * Allocated for the write that records the outcome, so the two land together: a terminal record that
     * reached storage without an order would sort ahead of every sequenced run of its slot, and
     * {@link supersederOf} would then let an older run's rollback overwrite it. A refused write leaves a gap in
     * the sequence, which costs nothing — the order only ever has to be increasing.
     */
    nextRetirement(record: RunRecord): RetireSeq | undefined {
        if (this.#slots.get(record.slotKey) !== record.runId || record.retireSeq !== undefined) {
            return undefined;
        }
        return RetireSeq(this.#nextRetireSeq++);
    }

    /** Hand back a retired run's slot, once the write carrying its outcome has landed. */
    commitRetirement(record: RunRecord): void {
        if (this.#slots.get(record.slotKey) === record.runId) {
            this.#slots.delete(record.slotKey);
        }
        this.#executions.delete(record.runId);
    }

    /** Forget a run that was never persisted, so a refused write leaves nothing for a later resume to find. */
    discard(record: RunRecord): void {
        this.#records.delete(record.runId);
        this.#executions.delete(record.runId);
        if (this.#slots.get(record.slotKey) === record.runId) {
            this.#slots.delete(record.slotKey);
        }
    }

    /**
     * A retired run of the same slot that finished after `runId`, if there is one.
     *
     * Undoing a run restores the values it found, so a later run of the same slot having since committed its
     * own makes those values historical: applying them would overwrite an outcome nobody asked to undo.
     */
    supersederOf(runId: RunId): RunRecord | undefined {
        const record = this.#records.get(runId);
        if (record === undefined || !isTerminal(record.state)) {
            return undefined;
        }
        const retiredAt = record.retireSeq ?? 0;
        for (const other of this.#records.values()) {
            if (
                other.runId !== runId &&
                other.slotKey === record.slotKey &&
                isTerminal(other.state) &&
                (other.retireSeq ?? 0) > retiredAt
            ) {
                return other;
            }
        }
        return undefined;
    }

    /**
     * The rollback that undoes `runId`, if one exists — whether or not the run's own record names it yet.
     *
     * Derived rather than remembered: a rollback is linked by identity from the moment it is admitted, so a
     * second cancel racing the first finds the rollback already being prepared instead of trying to create
     * another one.
     */
    rollbackOf(runId: RunId): RunRecord | undefined {
        for (const record of this.#records.values()) {
            if (record.revertOf === runId) {
                return record;
            }
        }
        return undefined;
    }

    /**
     * A live rollback of any retired run of `slotKey`. A rollback rewrites exactly the intents a re-run would
     * re-apply, so the two must never overlap — and the rollback in flight is not necessarily undoing the most
     * recent run of the slot.
     */
    pendingRevertOfSlot(slotKey: string): RunRecord | undefined {
        const undone = new Set<RunId>();
        for (const record of this.#records.values()) {
            if (record.slotKey === slotKey && isTerminal(record.state)) {
                undone.add(record.runId);
            }
        }
        for (const record of this.live) {
            if (record.revertOf !== undefined && undone.has(record.revertOf)) {
                return record;
            }
        }
        return undefined;
    }

    snapshot(): RunStoreSnapshot {
        const runs: Record<string, TaskPersistence> = {};
        for (const [runId, record] of this.#records) {
            runs[runKey(runId)] = record.toPersistence();
        }
        return { runs, nextRunId: this.#nextRunId, nextRetireSeq: this.#nextRetireSeq };
    }
}
