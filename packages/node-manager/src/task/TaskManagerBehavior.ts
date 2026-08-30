/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { asError, ImplementationError, Lifecycle, Logger, Mutex, Observable } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import { Agent, Behavior, ClientNode, DesiredStateBehavior, itemMapKey, Node, ServerNode } from "@matter/node";
import {
    TaskCancelledSignal,
    TaskCapacityExceededError,
    TaskConflictError,
    TaskManagerClosingError,
    TaskNotFoundError,
    TaskNotRevertibleError,
    TaskSuspendedSignal,
    TaskTypeNotRegisteredError,
} from "./errors.js";
import { AddNodeToGroup } from "./groups/AddNodeToGroup.js";
import { RemoveNodeFromGroup } from "./groups/RemoveNodeFromGroup.js";
import { RotateGroupKey } from "./groups/RotateGroupKey.js";
import { Revert, REVERT_TYPE } from "./Revert.js";
import { GateControl, RunningTaskContext } from "./RunningTaskContext.js";
import { isTerminal, RunStore } from "./RunStore.js";
import { runKey, runLabel, RunView, Task, TaskDefinition, TaskPersistence } from "./Task.js";
import { TaskRegistry } from "./TaskRegistry.js";
import { PlannedChange, RunId, TaskState, TaskStatus } from "./types.js";

const logger = Logger.get("TaskManager");

export interface TaskHandle {
    /** The run this handle names. Pass it directly to {@link TaskManagerBehavior.cancel} and friends. */
    readonly runId: RunId;
    /** Read through to the run, so a held handle keeps answering as the run progresses and retires. */
    readonly status: TaskStatus;
}

/**
 * A task's rollback with the two operations that keep it consistent with its record: {@link discard} forgets a
 * rollback whose record was refused, {@link start} begins driving one whose record is durable.
 */
interface PreparedRevert {
    readonly task?: Task;
    discard(): void;
    start(): void;
}

/** The rollback of a task that has nothing to roll back: nothing to write, start or forget. */
const NO_REVERT: PreparedRevert = { discard() {}, start() {} };

/** A task registered as live, and whether the caller joined a live task that is already being driven. */
interface SpawnedTask {
    task: Task;
    joined: boolean;
}

export class TaskManagerBehavior extends Behavior {
    static override readonly id = "taskManager";
    static override readonly early = true;

    declare readonly state: TaskManagerBehavior.State;
    declare internal: TaskManagerBehavior.Internal;

    // Nonvolatility comes from the schema member's `N` quality, not from the State property, so a counter
    // added to State alone would silently reset to 0 on every restart and re-issue live identities.
    static override readonly schema = new DatatypeModel({
        name: "TaskManager",
        type: "struct",
        children: [
            FieldElement({
                name: "runs",
                type: "any",
                quality: "N",
                default: { type: "properties", properties: {} },
            }),
            FieldElement({ name: "nextRunId", type: "uint32", quality: "N", default: 1 }),
            FieldElement({ name: "nextRetireSeq", type: "uint32", quality: "N", default: 1 }),
        ],
    });

    override async initialize() {
        this.endpoint.behaviors.require(ReconcilerBehavior);
        this.internal.registry = new TaskRegistry();
        this.internal.runs = new RunStore();
        this.internal.gates = new Map();
        const { discarded } = this.internal.runs.load({
            runs: this.state.runs,
            nextRunId: this.state.nextRunId,
            nextRetireSeq: this.state.nextRetireSeq,
        });
        if (discarded > 0) {
            logger.warn(`Discarded ${discarded} task record(s) predating per-run identity`);
        }
        // Reserved here rather than on the first record write: on a fresh store nothing has been written yet,
        // so without this the very first identity would be handed out uncovered.
        this.#reserveIdentities();
        this.#registerBuiltins();
        // Driving acts on the node, so the resume pass must wait until the node is online.
        if (this.#rootNode.lifecycle.isOnline) {
            this.#resumePersisted();
        } else {
            this.reactTo(this.#rootNode.lifecycle.online, this.#resumePersisted);
        }
    }

    #resumePersisted(): void {
        for (const type of new Set(this.#resumable.map(r => r.type))) {
            this.#resumeType(type);
        }
    }

    /** Records still awaiting resume, in ascending runId — the only order defined for resume. */
    get #resumable(): TaskPersistence[] {
        return this.internal.runs.pending;
    }

    /** Built-in task types registered before the resume pass. */
    protected registerBuiltins(): void {
        this.internal.registry.register(AddNodeToGroup);
        this.internal.registry.register(RemoveNodeFromGroup);
        this.internal.registry.register(RotateGroupKey);
        this.internal.registry.register(Revert);
    }

    #registerBuiltins(): void {
        this.registerBuiltins();
    }

    /** Record how far identities are reserved, so allocation may run ahead of the next record write. */
    #reserveIdentities(): void {
        const reservedRunId = this.internal.runs.reservedRunId;
        if (this.state.nextRunId < reservedRunId) {
            this.state.nextRunId = reservedRunId;
        }
        // Written in this same transaction, so the boundary it establishes is durable with it.
        this.internal.runs.noteReserved(this.state.nextRunId);
    }

    get #rootNode(): ServerNode {
        return Node.forEndpoint(this.endpoint) as ServerNode;
    }

    get #mutex(): Mutex {
        if (this.internal.persistMutex === undefined) {
            this.internal.persistMutex = new Mutex(this);
        }
        return this.internal.persistMutex;
    }

    register<P>(definition: TaskDefinition<P>): void {
        // Resuming drives a phase, which the dispose drain may already have passed and no persist can record.
        this.#refuseIfClosing(`Task type "${definition.type}" cannot be registered`);
        this.internal.registry.register(definition);
        // Apps register custom task types after construction; resume their persisted, non-terminal tasks now.
        this.#resumeType(definition.type);
    }

    /**
     * Resume persisted, non-terminal, not-yet-live runs of a registered type.
     *
     * Records are per-run now, so two records can name one slot where the id-keyed store admitted only one.
     * Resume therefore consults the slot index, and each record resumes inside its own boundary so one that
     * cannot be resumed does not strand every record after it.
     */
    #resumeType(type: string): void {
        if (!this.internal.registry.has(type)) {
            return;
        }
        for (const record of this.#resumable) {
            if (record.type !== type) {
                continue;
            }
            const owner = this.internal.runs.ownerOf(record.slotKey);
            if (owner !== undefined) {
                logger.warn(`Not resuming run ${record.runId}: slot ${record.slotKey} is owned by run ${owner.runId}`);
                continue;
            }
            try {
                const task = this.internal.registry.create(type, record.runId, record.slotKey, record.params, record);
                this.internal.runs.admit(task);
                // Dropped from pending only now: a record whose task could not be built is still unfinished
                // work, and forgetting it here would free its slot and hide it from lookup for this process.
                this.internal.runs.resolvePending(record.runId);
                this.#redrive(task);
            } catch (e) {
                logger.error(`Cannot resume run ${record.runId}`, e);
            }
        }
    }

    /**
     * Begin (or resume) driving a live non-terminal task. A `parked` task becomes `running` first: {@link #drive}
     * only advances a running task, and the phase's gate re-parks from live reachability if the peer is still gone.
     */
    #redrive(task: Task): void {
        if (task.progress.state === "parked") {
            task.progress.state = "running";
        }
        this.#track(task);
    }

    // The gate must exist before driving starts — it is the only home for an abort reason, so a cancel or shutdown
    // arriving before the first phase builds its gate would otherwise be discarded. It is created fresh so an abort
    // recorded for an earlier run of this id cannot carry over.
    #track(task: Task): void {
        this.internal.gates.set(task.runId, { wake: new Observable() });
        const drivePromise: Promise<void> = this.#drive(task).finally(() => this.#retire(task));
        this.internal.driving.set(task.runId, drivePromise);
    }

    /**
     * Release a settled run: hand back its slot and drop its bookkeeping.
     *
     * The slot is released here rather than when the state turned terminal, because a task is terminal before
     * its driver stops: a re-run admitted any earlier would start writing to the peer while this run's unwind
     * is still in flight. The retirement order is stamped when the outcome is assigned and travels with the
     * write that records it, so nothing is written here.
     */
    #retire(task: Task): void {
        try {
            // A cancel awaiting this driver owns the run's terminal state, so it owns the retirement too: the
            // run is still `running` here, and retiring it now would record it mid-cancel.
            if (this.internal.cancelling.has(task.runId)) {
                return;
            }
            // A non-terminal run otherwise reaches here through shutdown, which leaves it for the next start.
            // An outcome whose write was refused carries no stamp, so the run keeps its slot rather than
            // retiring behind a record storage does not have.
            if (!isTerminal(task.progress.state) || task.retireSeq === undefined) {
                return;
            }
            this.internal.runs.commitRetirement(task);
        } finally {
            // Cleared last: a run is not settled until its retirement is, and an observer that watches the
            // driver would otherwise see it finish while the slot is still momentarily released.
            this.internal.driving.delete(task.runId);
            this.internal.gates.delete(task.runId);
        }
    }

    /**
     * Start `type` with `params`. The task's id is derived from type and params, and only one live task may hold
     * it: a caller that passes an `externalId` re-issues its own request idempotently, and any other request for
     * an id a live task already holds is refused rather than silently resolving onto work it did not ask for.
     * The `externalId` is also the id the caller can {@link get} and {@link cancel} its task under.
     */
    run(type: string, params: unknown, opts?: { externalId?: string }): TaskHandle {
        if (!this.internal.registry.callerCreatable(type)) {
            throw new ImplementationError(
                `Task type "${type}" undoes another run and is created by cancel(), not by run()`,
            );
        }
        const { task, joined } = this.#spawn(type, params, { externalId: opts?.externalId });
        if (!joined) {
            this.#track(task);
        }
        return this.#handle(task);
    }

    /**
     * Shared creation path so callers (e.g. #prepareRevert) can seed persisted fields before the first persist.
     * Registers a new task as live but does not drive it: a task whose record must be durable before it touches a
     * peer starts with {@link #track} once the write lands.
     */
    #spawn(type: string, params: unknown, seed: Partial<TaskPersistence>): SpawnedTask {
        const slotKey = this.internal.registry.slotKeyFor(type, params);
        const runs = this.internal.runs;

        // Steps run in a fixed order because the order decides which refusal a caller sees, and because a
        // slot check that ran before the externalId lookup would turn every join into a conflict. No await
        // anywhere below, so there is no window between the checks and the admission that follows them.

        // 1. Driving started now would outlive the dispose drain and write to peers after close.
        this.#refuseIfClosing(`Task ${slotKey} cannot start`);

        // 2. A persisted run awaiting resume still owns its slot. Letting new work take it would leave that
        //    run unresumable and its already-written intents with no owner.
        const awaiting = runs.pendingOwnerOf(slotKey);
        if (awaiting !== undefined) {
            throw new TaskConflictError(
                `Task ${slotKey} rejected: ${runLabel(awaiting.runId)} holds this slot and is awaiting resume; register its type "${awaiting.type}" to continue it`,
                awaiting.runId,
            );
        }

        // 3. The slot's owner joins the caller that already asked for this work, and refuses everyone else.
        const owner = runs.ownerOf(slotKey);
        if (owner !== undefined) {
            if (this.internal.cancelling.has(owner.runId)) {
                throw new TaskConflictError(
                    `Task ${slotKey} rejected: a cancel of ${runLabel(owner.runId)} is still in flight`,
                    owner.runId,
                );
            }
            if (seed.externalId === undefined || seed.externalId !== owner.externalId) {
                throw new TaskConflictError(
                    `Task ${slotKey} rejected: slot held by ${runLabel(owner.runId)} (${owner.progress.state})`,
                    owner.runId,
                );
            }
            return { task: owner, joined: true };
        }

        // 4. An external id is one-to-one: a live run of another slot must not lose the name it answers to.
        if (seed.externalId !== undefined) {
            const holder = runs.conflictingExternalIdHolder(seed.externalId, slotKey);
            if (holder !== undefined) {
                throw new TaskConflictError(
                    `Task ${slotKey} rejected: external id "${seed.externalId}" names ${runLabel(holder.runId)} of slot ${holder.slotKey}`,
                    holder.runId,
                );
            }
        }

        // 5. A rollback rewrites exactly the intents a re-run would re-apply, so the two must never overlap —
        //    and the rollback in flight need not be undoing the most recent run of the slot.
        const pendingRevert = runs.pendingRevertOfSlot(slotKey);
        if (pendingRevert !== undefined) {
            throw new TaskConflictError(
                `Task ${slotKey} rejected: rollback ${runLabel(pendingRevert.runId)} is still in flight and would undo it again`,
                pendingRevert.runId,
            );
        }

        // 6. A rollback contends for the slot of the run it undoes, not for its own: its slot is unique per
        //    run, so checking that alone would let two rollbacks of one slot, or a rollback and the newer run
        //    that now owns the slot, rewrite the same intents at once.
        const undone = this.internal.registry.undoes(type, params);
        if (undone !== undefined) {
            const undoneSlot = (runs.liveRun(undone) ?? runs.retiredRun(undone) ?? runs.pendingRun(undone))?.slotKey;
            if (undoneSlot !== undefined) {
                const holder = runs.ownerOf(undoneSlot);
                // A rollback is only ever prepared by cancel, which has already stopped the run's driver, so
                // the run still holding its own slot here is expected. Any other holder is live work this
                // rollback would rewrite underneath.
                if (holder !== undefined && holder.runId !== undone) {
                    throw new TaskConflictError(
                        `Rollback of ${runLabel(undone)} rejected: slot ${undoneSlot} is held by ${runLabel(holder.runId)}`,
                        holder.runId,
                    );
                }
                const superseder = runs.supersederOf(undone);
                if (superseder !== undefined) {
                    throw new TaskConflictError(
                        `Rollback of ${runLabel(undone)} rejected: ${runLabel(superseder.runId)} has since committed slot ${undoneSlot}, so the values this would restore are historical`,
                        superseder.runId,
                    );
                }
                const sibling = runs.pendingRevertOfSlot(undoneSlot);
                if (sibling !== undefined) {
                    throw new TaskConflictError(
                        `Rollback of ${runLabel(undone)} rejected: rollback ${runLabel(sibling.runId)} is already undoing slot ${undoneSlot}`,
                        sibling.runId,
                    );
                }
            }
        }

        const task = this.internal.registry.create(type, runs.allocate(), slotKey, params, seed);
        runs.admit(task);
        return { task, joined: false };
    }

    /** Resolve a run across every tier: live, then retired, then tombstone. */
    get(runId: RunId): TaskHandle | undefined {
        const live = this.internal.runs.liveRun(runId);
        if (live !== undefined) {
            return this.#handle(live);
        }
        const record = this.internal.runs.retiredRun(runId) ?? this.internal.runs.pendingRun(runId);
        return record === undefined ? undefined : this.#recordHandle(record);
    }

    /**
     * Resolve the run a caller's own id names. Separate from {@link get} so no call site has to encode which
     * namespace a string belongs to — the mistake a single polymorphic lookup makes easy to write and
     * impossible for the compiler to catch.
     */
    forExternalId(externalId: string): TaskHandle | undefined {
        const found = this.internal.runs.findByExternalId(externalId);
        return found === undefined ? undefined : this.get(found.runId);
    }

    /** Runs that still own their slot. A retired run answers {@link get} but is not live work. */
    get tasks(): TaskHandle[] {
        return this.internal.runs.live.map(t => this.#handle(t));
    }

    /** Retired records, newest retirement first. */
    history(limit?: number): TaskHandle[] {
        if (limit !== undefined && !Number.isInteger(limit)) {
            throw new ImplementationError(`history limit must be an integer, got ${limit}`);
        }
        const records = this.internal.runs.retired;
        return (limit === undefined ? records : records.slice(0, Math.max(0, limit))).map(r => this.#recordHandle(r));
    }

    #handle(task: Task): TaskHandle {
        // A held handle must keep answering for the task it names; a snapshot would freeze at creation time.
        return {
            runId: task.runId,
            get status() {
                return task.status;
            },
        };
    }

    #recordHandle(record: TaskPersistence): TaskHandle {
        return {
            runId: record.runId,
            get status(): TaskStatus {
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
            },
        };
    }

    /**
     * Start a fresh rollback for a run whose previous one did not finish.
     *
     * A rollback is created by {@link cancel}, so retrying one cannot be an ordinary `run`: only the manager
     * knows the original's driver is stopped and that no other rollback of its slot is in flight. Refuses
     * while the recorded rollback is still going, since that one may yet succeed.
     */
    async retryRollback(runId: RunId): Promise<TaskHandle> {
        const live = this.internal.runs.liveRun(runId);
        const retired = this.internal.runs.retiredRun(runId);
        if (live === undefined && retired === undefined) {
            throw new TaskNotFoundError(`Cannot retry the rollback of ${runLabel(runId)}: no run answers to it`);
        }
        const previous = live?.revertRunId ?? retired?.revertRunId;
        if (previous === undefined) {
            throw new ImplementationError(`${runLabel(runId)} has no rollback to retry`);
        }
        const inFlight = this.internal.runs.liveRun(previous);
        if (inFlight !== undefined) {
            throw new TaskConflictError(
                `Cannot retry the rollback of ${runLabel(runId)}: ${runLabel(previous)} is still in flight`,
                previous,
            );
        }

        const original = live ?? this.#reconstitute(retired!);
        original.revertRunId = undefined;
        const revert = this.#prepareRevert(original);
        if (revert.task === undefined) {
            throw new ImplementationError(`${runLabel(runId)} has nothing to roll back`);
        }
        try {
            await this.#persist(original, revert.task);
        } catch (e) {
            original.revertRunId = previous;
            revert.discard();
            throw e;
        }
        revert.start();
        return this.#handle(revert.task);
    }

    /** Rebuild a retired run from its record, which undo needs because revertibility is the task's decision. */
    #reconstitute(record: TaskPersistence): Task {
        if (!this.internal.registry.has(record.type)) {
            throw new TaskTypeNotRegisteredError(
                `Cannot act on ${runLabel(record.runId)}: task type "${record.type}" is not registered`,
            );
        }
        return this.internal.registry.create(record.type, record.runId, record.slotKey, record.params, record);
    }

    /**
     * Cancel a task: stop forward driving, then spawn a revert task that rolls back the changeSet as an ordinary
     * task (parks on offline peers, resumes after restart). Does not await the revert — the caller observes it
     * via the returned handle.
     *
     * Each outcome has exactly one meaning: a handle is the rollback, `undefined` is a run with nothing to roll
     * back, and {@link TaskNotFoundError} is an identity no run answers to — live or retired, since a finished
     * run keeps the changeSet its rollback needs.
     *
     * Throws {@link TaskManagerClosingError} if shutdown intervenes before the cancel can be recorded; the task
     * then keeps its non-terminal state and the cancel must be re-issued after the next start.
     */
    async cancel(runId: RunId): Promise<TaskHandle | undefined> {
        let task = this.internal.runs.liveRun(runId);
        const retired = task === undefined ? this.internal.runs.retiredRun(runId) : undefined;
        if (task === undefined && retired === undefined) {
            throw new TaskNotFoundError(`Cannot cancel ${runLabel(runId)}: no run answers to it`);
        }

        // Every decision below reads the run as a view, which a live run and a retired record both satisfy, so a
        // cancel that is answered or declined never rebuilds a finished run as an object.
        const view: RunView = task ?? retired!;
        const params = task === undefined ? retired!.params : task.params;

        // A rollback this run already recorded is the answer, wherever it now lives: reporting it as unknown
        // would make re-cancelling fail the moment its rollback finishes.
        if (view.revertRunId !== undefined) {
            return this.get(view.revertRunId);
        }
        if (view.state === "cancelled") {
            return undefined;
        }

        // Deciding on a NEW rollback is the task's decision, so this is the one place a retired run's type must
        // be registered.
        if (task === undefined && !this.internal.registry.has(view.type)) {
            throw new TaskTypeNotRegisteredError(
                `Cannot act on ${runLabel(view.runId)}: task type "${view.type}" is not registered`,
            );
        }

        // A task past its point of no return declines cancel with zero side effects (gate untouched, state kept).
        if (!this.internal.registry.revertible(view, params)) {
            throw new TaskNotRevertibleError(
                `${runLabel(view.runId)} is not revertible: ${this.internal.registry.notRevertibleReason(view.type)}`,
            );
        }

        // Only now, and only for a finished run: the writable copy exists solely to carry the mutation that
        // follows, never to answer a question.
        task ??= this.#reconstitute(retired!);

        // Stop forward driving so the changeset is final before we revert it. The flag also covers the
        // between-phase gap the gate cannot: the driver checks it synchronously before advancing a phase.
        this.internal.cancelling.add(task.runId);
        this.#abortGate(task.runId, new TaskCancelledSignal(`${runLabel(task.runId)} cancelled`));
        try {
            await this.internal.driving.get(task.runId);
        } finally {
            // A `cancelling` entry left behind refuses every future run of this slot for the process lifetime.
            this.internal.gates.delete(task.runId);
            this.internal.cancelling.delete(task.runId);
        }

        // Shutdown took over the unwind: state can no longer be persisted, so leave the task non-terminal and
        // unreverted rather than claiming a cancel that storage would contradict on the next start.
        this.#refuseIfClosing(`${runLabel(task.runId)} cannot be cancelled`);

        // Prepared before the state changes: a refused rollback must leave the task as it was, not cancelled in
        // memory and unchanged in storage.
        let revert: PreparedRevert;
        try {
            revert = this.#prepareRevert(task);
        } catch (e) {
            // The abort above stopped the driver and dropped its gate. A task the manager declines to cancel
            // keeps its state, so it must keep its driver too, or it sits non-terminal with nothing left to
            // advance it. A retired run was reconstituted from its record and never had a driver here; driving
            // it would write that reconstituted state back over whatever the record now holds.
            if (this.internal.runs.isLive(task.runId)) {
                this.#redrive(task);
            }
            throw e;
        }
        const stateBeforeCancel = task.progress.state;
        // running/parked → cancelled; an already-terminal (completed/failed) task keeps its truthful state.
        if (stateBeforeCancel === "running" || stateBeforeCancel === "parked") {
            task.progress.state = "cancelled";
        }
        // Stamped before the write so one transaction carries the cancelled state, the retirement order and
        // the rollback that undoes it; the slot moves only once that write is durable.
        this.internal.runs.stampRetirement(task);
        try {
            await this.#persist(task, revert.task);
        } catch (e) {
            task.progress.state = stateBeforeCancel;
            this.internal.runs.abandonRetirement(task);
            revert.discard();
            // A cancel that did not happen leaves the task as it was, driver included. A retired run has no
            // driver to restore, and driving its reconstituted copy would overwrite the stored record.
            if (this.internal.runs.isLive(task.runId)) {
                this.#redrive(task);
            }
            throw e;
        }
        this.internal.runs.commitRetirement(task);
        // The rollback mutates peers, so it may not drive before the record that names it is durable.
        revert.start();
        // Resolved from the run's own link rather than from what this call prepared: a second cancel that
        // raced this one finds the rollback already recorded, and must be told about it rather than told
        // there was nothing to roll back.
        return task.revertRunId === undefined ? undefined : this.get(task.revertRunId);
    }

    // Teardown starts at the node, not at this behavior: `Construction.close` applies `Destroying` before it runs
    // the destructor that closes behaviors, so this reads true for the whole of our own teardown — from which point
    // `endpoint.act` refuses and no state write can land.
    get #isClosing(): boolean {
        const { status } = this.endpoint.construction;
        return status === Lifecycle.Status.Destroying || status === Lifecycle.Status.Destroyed;
    }

    #refuseIfClosing(subject: string): void {
        if (this.#isClosing) {
            throw new TaskManagerClosingError(`${subject}: the task manager is shutting down`);
        }
    }

    /** Create (or reuse) the revert task for `task`, linking both directions, without driving it. */
    #prepareRevert(task: Task): PreparedRevert {
        // A failed revert surfaces as `failed` for operator attention; reverting a revert would recurse unbounded.
        if (task.type === REVERT_TYPE) {
            return NO_REVERT;
        }
        // Past a task's point of no return there is nothing to roll back to; suppress auto-rollback too.
        if (!this.internal.registry.revertible(task, task.params)) {
            return NO_REVERT;
        }
        // Already rolled back once: cancel resolves the recorded rollback itself, so there is nothing to
        // prepare, write or start here.
        if (task.revertRunId !== undefined) {
            return NO_REVERT;
        }
        if (task.changeSet.length === 0) {
            return NO_REVERT;
        }
        // `revertOf` is seeded on every rollback the manager creates, retries included: it is the identity
        // link that refuses a re-run of the original, and a rollback that lacks it excludes nothing.
        const { task: revert, joined } = this.#spawn(
            REVERT_TYPE,
            { originalRunId: task.runId, entries: task.changeSet },
            { revertOf: task.runId },
        );
        task.revertRunId = revert.runId;
        // A joined rollback is already live and driving, so it is not ours to start or to forget.
        if (joined) {
            return { task: revert, discard() {}, start() {} };
        }
        return {
            task: revert,
            discard: () => {
                task.revertRunId = undefined;
                this.internal.runs.discard(revert);
            },
            start: () => this.#track(revert),
        };
    }

    #abortGate(id: RunId, reason: unknown): void {
        const gate = this.internal.gates.get(id);
        if (gate === undefined) {
            return;
        }
        gate.aborted = reason;
        gate.wake.emit();
    }

    /** Throw a recorded abort (cancel or shutdown) so the driver stops before persisting or mutating a peer. */
    #throwIfAborted(task: Task): void {
        const aborted = this.internal.gates.get(task.runId)?.aborted;
        if (aborted !== undefined) {
            throw asError(aborted);
        }
    }

    /**
     * Reject a task before any node mutation if its planned changes would overflow a target's device capacity.
     * Runs before the first persist/phase; the thrown error ends the task `failed` with an empty changeSet.
     */
    async #admit(task: Task): Promise<void> {
        const planned = this.internal.registry.plannedChanges(task.type, task.params);
        if (planned.length === 0) {
            return;
        }
        const byNodeKind = new Map<string, PlannedChange[]>();
        for (const pc of planned) {
            const k = `${pc.peerId}\0${pc.kind}`;
            let group = byNodeKind.get(k);
            if (group === undefined) {
                group = new Array<PlannedChange>();
                byNodeKind.set(k, group);
            }
            group.push(pc);
        }
        for (const group of byNodeKind.values()) {
            const { peerId, kind } = group[0];
            const peer = this.resolvePeerNode(peerId);
            if (peer === undefined) {
                continue; // unresolvable peer: the phase gate will park; capacity is re-checked on device write
            }
            const itemKind = await this.endpoint.act(agent => this.taskReconciler(agent).itemKind(kind));
            if (itemKind?.excludeFromAdmission) {
                continue; // capacity counts a coarser resource another kind already gates (e.g. membership vs group)
            }
            const capacity = await itemKind?.capacity?.(peer);
            if (capacity === undefined) {
                continue; // kind reports no capacity limit (e.g. groupKey) — the device write is the gate
            }
            const items = peer.stateOf(DesiredStateBehavior).items;
            const added = group.filter(pc => items[itemMapKey(pc.kind, pc.key)] === undefined).length;
            if (capacity.used + added > capacity.limit) {
                throw new TaskCapacityExceededError(
                    `${runLabel(task.runId)}: ${kind} on ${peerId} exceeds capacity — needs ${added} slot(s) but only ${capacity.limit - capacity.used} free`,
                );
            }
        }
    }

    async #drive(task: Task): Promise<void> {
        try {
            await this.#admit(task); // fail-fast before any node is touched
            this.#throwIfAborted(task);
            // Persist before first phase so a crash-resume sees the task.
            await this.#persist(task);
            while (task.progress.phaseIndex < task.phases.length && task.progress.state === "running") {
                const phase = task.phases[task.progress.phaseIndex];
                const ctx = await this.endpoint.act(agent => this.#contextFor(task, this.taskReconciler(agent)));
                // A phase mutates the peer before it reaches its gate, so this is the last point at which an
                // abort accepted meanwhile can still prevent the write.
                this.#throwIfAborted(task);
                await phase.run(ctx);
                // A cancel accepted while the phase ran must leave phaseIndex on that phase: revertibility is
                // phase-based, so advancing it can cross a task's point of no return and suppress the rollback.
                if (this.internal.cancelling.has(task.runId)) {
                    throw new TaskCancelledSignal(`Task ${runLabel(task.runId)} cancelled`);
                }
                task.progress.phaseIndex += 1;
                await this.#persist(task);
            }
            if (task.progress.state === "running") {
                task.progress.state = "completed";
                this.internal.runs.stampRetirement(task);
                try {
                    await this.#persist(task);
                } catch (e) {
                    this.internal.runs.abandonRetirement(task);
                    throw e;
                }
            }
        } catch (e) {
            // Shutdown leaves the task non-terminal for resume; cancel is finalized by cancel() itself.
            if (e instanceof TaskSuspendedSignal || e instanceof TaskCancelledSignal) {
                return;
            }
            // Teardown: neither the failure nor a rollback of it can be recorded, and the rollback's driving would
            // outlive the dispose drain. Leave the task as the next start can resume it.
            if (this.#isClosing) {
                logger.warn(
                    `${runLabel(task.runId)} interrupted by shutdown; its persisted state is left for the next start`,
                    e,
                );
                return;
            }
            task.progress.state = "failed";
            task.error = e instanceof Error ? e.message : String(e);
            logger.error(`${runLabel(task.runId)} failed`, e);
            // Neither a rollback this manager refuses nor a failing persist may re-reject the (otherwise handled)
            // drive promise: that turns into an unhandled rejection and a cancel awaiting this task throws.
            let revert = NO_REVERT;
            try {
                revert = this.#prepareRevert(task);
            } catch (revertError) {
                logger.error(`${runLabel(task.runId)}: cannot roll back`, revertError);
            }
            this.internal.runs.stampRetirement(task);
            try {
                await this.#persist(task, revert.task);
            } catch (persistError) {
                this.internal.runs.abandonRetirement(task);
                revert.discard();
                logger.error(`${runLabel(task.runId)}: failed to persist failure state`, persistError);
                return;
            }
            // The rollback mutates peers, so it may not drive before the record that names it is durable.
            revert.start();
        }
    }

    #contextFor(task: Task, reconciler: ReconcilerBehavior): RunningTaskContext {
        const setState = (state: TaskState) => {
            // Terminal states are owned by #drive; gates only flip between running/parked.
            if (
                task.progress.state === state ||
                (task.progress.state !== "running" && task.progress.state !== "parked")
            ) {
                return;
            }
            task.progress.state = state;
            this.#mutex.run(() => this.#writeRecord(task));
        };
        return new RunningTaskContext(
            task,
            id => this.resolvePeerNode(id),
            reconciler,
            setState,
            this.#gateFor(task.runId),
            () => [...this.#rootNode.peers],
        );
    }

    #gateStateFor(id: RunId): TaskManagerBehavior.GateState {
        let gate = this.internal.gates.get(id);
        if (gate === undefined) {
            gate = { wake: new Observable() };
            this.internal.gates.set(id, gate);
        }
        return gate;
    }

    /** Per-task gate control: cancel/shutdown set `aborted`; `onAbort` wakes a parked gate to observe it. */
    #gateFor(id: RunId): GateControl {
        const gate = this.#gateStateFor(id);
        return {
            aborted: () => gate.aborted,
            onAbort: wake => {
                gate.wake.on(wake);
                return () => gate.wake.off(wake);
            },
        };
    }

    /** The reconciler a task's gates use. Overridable for testing without a commissioned fabric. */
    protected taskReconciler(agent: Agent): ReconcilerBehavior {
        return agent.get(ReconcilerBehavior);
    }

    /** Resolve a peer by id for gates and cancel-revert. Overridable for testing. */
    protected resolvePeerNode(peerId: string): ClientNode | undefined {
        return this.#rootNode.peers.get(peerId);
    }

    // Serialized through the mutex: a spawned revert drives (and persists) concurrently with the original's
    // own persist, so direct concurrent state writes would conflict on the synchronous transaction lock.
    async #persist(task: Task, paired?: Task): Promise<void> {
        await this.#mutex.produce(() => this.#writeRecord(task, paired));
    }

    // A task that names a revert and the revert itself go into one transaction: written separately, a crash
    // between the two loses the rollback while the forward record still promises it.
    async #writeRecord(task: Task, paired?: Task): Promise<void> {
        // Serialized with the write, so a shutdown that began while this queued behind the mutex cannot slip past.
        this.#refuseIfClosing(`${runLabel(task.runId)} state cannot be recorded`);
        // Only the named runs are written. Republishing the whole table from memory would erase records this
        // process never loaded — a persisted run whose type nothing has registered yet — and would publish
        // other runs' uncommitted in-flight state as though it were durable.
        const written = paired === undefined ? [task] : [task, paired];
        const records = written.map(t => [runKey(t.runId), t.toPersistence()] as const);
        const { nextRetireSeq } = this.internal.runs.snapshot();
        const reservedRunId = this.internal.runs.reservedRunId;
        await this.endpoint.act(agent => {
            const self = agent.get(TaskManagerBehavior);
            const runs = { ...self.state.runs };
            for (const [key, record] of records) {
                runs[key] = record;
            }
            self.state.runs = runs;
            // High-water marks: never `consumed + 1`, or a write that lands out of allocation order lowers the
            // counter below a durable identity and a crash re-issues it.
            self.state.nextRunId = Math.max(self.state.nextRunId, reservedRunId);
            self.state.nextRetireSeq = Math.max(self.state.nextRetireSeq, nextRetireSeq);
        });
        // Only now, and for the same reason in both cases: a value advanced before the write survives a write
        // that never landed. A retired record refreshed early would keep a change storage does not have, and a
        // reservation noted early would let the next identity be issued beyond what storage covers — which the
        // next start would then re-issue to different work.
        this.internal.runs.noteReserved(reservedRunId);
        for (const t of written) {
            this.internal.runs.refresh(t);
        }
    }

    override async [Symbol.asyncDispose]() {
        // Suspend in-flight gates so parked tasks stop cleanly (non-terminal, resumable) instead of hanging close.
        for (const id of this.internal.gates.keys()) {
            this.#abortGate(id, new TaskSuspendedSignal(`${runLabel(id)} suspended on shutdown`));
        }
        await Promise.allSettled([...this.internal.driving.values()]);
        await this.internal.persistMutex?.close();
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace TaskManagerBehavior {
    export class State {
        runs: Record<string, TaskPersistence> = {};
        nextRunId = 1;
        nextRetireSeq = 1;
    }

    export interface GateState {
        aborted?: unknown;
        wake: Observable<[]>;
    }

    export class Internal {
        registry!: TaskRegistry;
        runs!: RunStore;
        gates!: Map<RunId, GateState>;
        driving = new Map<RunId, Promise<void>>();
        cancelling = new Set<RunId>();
        persistMutex?: Mutex;
    }

    export class Events extends Behavior.Events {}
}
