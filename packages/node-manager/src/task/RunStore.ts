/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { TaskIdentityExhaustedError } from "./errors.js";
import { Execution } from "./Execution.js";
import { runKey, RunRecord, TaskPersistence } from "./Task.js";
import { RetireSeq, RunId, Teardown, TaskState } from "./types.js";

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set<TaskState>(["completed", "failed", "cancelled", "abandoned"]);

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

/**
 * Schema version of the persisted run table.
 *
 * Bumped whenever a build changes what a record means rather than merely what it contains, so a later build
 * can refuse a table it would misread. It cannot protect against a *downgrade* — an older build has no check —
 * so this buys detection from here on, not backward safety.
 */
export const RUN_STORE_VERSION = 2;

/**
 * One verb's exclusive hold on a run's outcome.
 *
 * {@link settled} resolves when the hold ends, so a second caller of the same verb waits for the decision and
 * then answers from it rather than being refused — a duplicate cancel is owed the rollback the first created.
 */
export interface RunTransition {
    readonly teardown: Teardown;
    readonly settled: Promise<void>;
}

export interface RunStoreSnapshot {
    runs: Record<string, TaskPersistence>;
    nextRunId: number;
    nextRetireSeq: number;
    runsVersion: number;
}

/**
 * The run table: identity allocation, the live slot index and retired records.
 *
 * Deliberately free of any dependency on a node, a gate or a clock, so its invariants — allocation
 * monotonicity, one owner per slot, ordering by retirement rather than by start — are testable without
 * driving a task. The manager owns persistence: it writes the records a transaction names
 * rather than republishing this table, so a run this process never loaded is never erased by one that did.
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
    #unreadable = false;

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
     * The verb currently taking a run's outcome away from its driver, for as long as that transition lasts.
     *
     * Kept here rather than on the execution because it must outlive one: a transition detaches the run it is
     * retiring, and a claim that died with the execution would let a second verb start against the same run in
     * the window before the first has written anything. It also answers a request for the target after the
     * driver has stopped, which is most of the window.
     */
    readonly #transitions = new Map<RunId, RunTransition & { release(): void }>();

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

        const version = snapshot?.runsVersion ?? 1;
        if (version > RUN_STORE_VERSION) {
            // Not loading is not enough on its own: the records stay in storage, so admitting work would drive
            // targets they own. Every verb refuses while this is set, rather than answering "no such run" for
            // runs that demonstrably exist in the table.
            this.#unreadable = true;
            return { resumable, discarded };
        }

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

    /**
     * Whether the stored table was written by a newer build, so nothing was loaded and nothing may be admitted.
     */
    get unreadable(): boolean {
        return this.#unreadable;
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

    /**
     * Take exclusive responsibility for `runId`'s outcome, refusing if another verb already has it.
     *
     * Exclusive because a transition stops the driver and then decides: two of them decide from the same
     * pre-transition state, and the second would either write over the first's outcome or restore a second
     * driver over the same record.
     */
    claimTransition(runId: RunId, teardown: Teardown): RunTransition | undefined {
        const held = this.#transitions.get(runId);
        if (held !== undefined) {
            return held;
        }
        let release!: () => void;
        const settled = new Promise<void>(resolve => (release = resolve));
        this.#transitions.set(runId, { teardown, settled, release });
        return undefined;
    }

    releaseTransition(runId: RunId): void {
        const held = this.#transitions.get(runId);
        if (held === undefined) {
            return;
        }
        this.#transitions.delete(runId);
        held.release();
    }

    /** The transition that currently owns `runId`'s outcome, if any. */
    transitionOf(runId: RunId): RunTransition | undefined {
        return this.#transitions.get(runId);
    }

    /**
     * A retired run of the same slot that finished after `runId` having written something, if there is one.
     *
     * Undoing a run restores the values it found, so a later run of the same slot having since committed its
     * own makes those values historical: applying them would overwrite an outcome nobody asked to undo. A
     * later run that wrote nothing left those values exactly as this one found them, so it makes nothing
     * historical — and refusing on it would strand the earlier run's changes on the device with no way back.
     * `#admit` produces exactly that shape: it fails a run with an empty changeSet before any peer is touched.
     *
     * A `completed` run is counted whatever its changeSet holds, because completion is the one retirement
     * that empties it: reversing a success is a new action rather than a replay, so an empty changeSet there
     * means "nothing left to restore", not "nothing was written". No other state may be inferred from an
     * empty changeSet: a failed run that reached the device must keep superseding, or an earlier run's undo
     * replays over changes it never made.
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
                (other.state === "completed" || other.changeSet.length > 0) &&
                (other.retireSeq ?? 0) > retiredAt
            ) {
                return other;
            }
        }
        return undefined;
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
     * reached storage without an order is discarded at load, because it has no position among the runs of its
     * slot. A refused write leaves a gap in the sequence, which costs nothing — the order only ever has to be
     * increasing.
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
     * The rollback of `runId`: the live one if there is one, otherwise the one its record names.
     *
     * **The only way to ask.** The relation has two representations — a rollback links to its original by
     * identity from the moment it is admitted, while the original's own link is durable but only lands with a
     * write — so a caller that picks one of them gets a different answer inside every persistence window. Every
     * decision about a run's rollback comes through here; `revertRunId` is read directly only to report
     * history.
     *
     * Unambiguous despite two rollbacks being able to exist for one run: a rollback's target is
     * `revert:<originalRunId>`, and a target has one owner, so only one of them is ever live.
     */
    rollbackFor(runId: RunId): RunRecord | undefined {
        for (const record of this.live) {
            if (record.revertOf === runId) {
                return record;
            }
        }
        const recorded = this.#records.get(runId)?.revertRunId;
        return recorded === undefined ? undefined : this.#records.get(recorded);
    }

    /**
     * A live rollback of any retired run of `slotKey`. A rollback rewrites exactly the intents a re-run would
     * re-apply, so the two must never overlap — and the rollback in flight is not necessarily undoing the most
     * recent run of the target.
     */
    liveRollbackOfTarget(slotKey: string): RunRecord | undefined {
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

    /**
     * The whole table as storage would hold it. Not how the manager writes — it records the runs a transaction
     * names, so a run this process never loaded is not erased by one that did — so this exists for a caller
     * that wants the table as a value.
     */
    snapshot(): RunStoreSnapshot {
        const runs: Record<string, TaskPersistence> = {};
        for (const [runId, record] of this.#records) {
            runs[runKey(runId)] = record.toPersistence();
        }
        return {
            runs,
            nextRunId: this.#nextRunId,
            nextRetireSeq: this.#nextRetireSeq,
            runsVersion: RUN_STORE_VERSION,
        };
    }
}
