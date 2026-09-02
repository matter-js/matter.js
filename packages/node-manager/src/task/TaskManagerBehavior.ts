/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { asError, ImplementationError, InternalError, Lifecycle, Logger, Mutex } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import { Agent, Behavior, ClientNode, DesiredStateBehavior, itemMapKey, Node, ServerNode } from "@matter/node";
import {
    TaskAbandonedError,
    TaskAbandonedSignal,
    TaskAlreadyUndoneError,
    TaskCancelledSignal,
    TaskCannotCancelRollbackError,
    TaskCapacityExceededError,
    TaskExternalIdInUseError,
    TaskManagerClosingError,
    TaskNoRollbackError,
    TaskNotARollbackError,
    TaskNotFoundError,
    TaskNotInFlightError,
    TaskNotRevertibleError,
    TaskRollbackPendingError,
    TaskSlotAwaitingResumeError,
    TaskSlotDrainingError,
    TaskSlotOccupiedError,
    TaskSlotSettlingError,
    TaskStopSignal,
    TaskStoreVersionError,
    TaskSupersededError,
    TaskSuspendedSignal,
    TaskTypeNotRegisteredError,
} from "./errors.js";
import { Execution, GateState } from "./Execution.js";
import { AddNodeToGroup } from "./groups/AddNodeToGroup.js";
import { RemoveNodeFromGroup } from "./groups/RemoveNodeFromGroup.js";
import { RotateGroupKey } from "./groups/RotateGroupKey.js";
import { Revert } from "./Revert.js";
import { GateControl, RunningTaskContext } from "./RunningTaskContext.js";
import { isTerminal, RUN_STORE_VERSION, RunStore } from "./RunStore.js";
import {
    BoundDefinition,
    DroppableField,
    runKey,
    runLabel,
    RunRecord,
    statusOf,
    TaskDefinition,
    TaskPersistence,
} from "./Task.js";
import { TaskRegistry } from "./TaskRegistry.js";
import { PlannedChange, RunId, TaskState, TaskStatus, Teardown } from "./types.js";

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
    readonly record?: RunRecord;
    discard(): void;
    start(): void;
}

/** The rollback of a task that has nothing to roll back: nothing to write, start or forget. */
const NO_REVERT: PreparedRevert = { discard() {}, start() {} };

/**
 * What a run stops carrying at any retirement. Parameters exist to re-drive phases on resume, and some carry
 * raw key material; a rollback replays the changeSet's priors, never params.
 */
const RETIRE: ReadonlyArray<DroppableField> = ["params"];

/**
 * Whether a rollback's undo has concluded: it restored the device, or it was called off before it wrote
 * anything. Either way nothing is left to retry or to give up on.
 *
 * `cancelled` is reachable only from a store an earlier build wrote, when cancelling a rollback was still
 * admitted.
 */
function undoConcluded(record: RunRecord): boolean {
    return record.state === "completed" || record.state === "cancelled";
}

/** A task registered as live, and whether the caller joined a live task that is already being driven. */
interface SpawnedExecution {
    execution: Execution;
    joined: boolean;
}

/** One record's part in a write: state to merge in, and fields to remove outright. */
interface RunChange {
    record: RunRecord;
    next?: Partial<TaskPersistence>;
    /**
     * Fields to remove. Separate from {@link RunChange.next}, where `undefined` means "unchanged" — an
     * intended-state merge that expressed removal as `undefined` erased a retirement order once already.
     */
    drop?: ReadonlyArray<DroppableField>;
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
            // Default 1, not the current version: nonvolatile state records what a transaction *changed*, so a
            // member defaulted to the reading build's own version would never differ from it, never be written,
            // and never tell a later build what wrote the table.
            FieldElement({ name: "runsVersion", type: "uint32", quality: "N", default: 1 }),
        ],
    });

    override async initialize() {
        this.endpoint.behaviors.require(ReconcilerBehavior);
        this.internal.registry = new TaskRegistry();
        this.internal.runs = new RunStore();
        const { discarded } = this.internal.runs.load({
            runs: this.state.runs,
            nextRunId: this.state.nextRunId,
            nextRetireSeq: this.state.nextRetireSeq,
            runsVersion: this.state.runsVersion,
        });
        if (discarded > 0) {
            logger.warn(`Discarded ${discarded} task record(s) predating per-run identity`);
        }
        // Registered either way, so the surface a caller sees does not depend on the store: an unreadable
        // store refuses at `run`, with a reason, rather than by claiming a type was never registered.
        this.#registerBuiltins();
        if (this.internal.runs.unreadable) {
            logger.error(
                `Task records are at schema version ${this.state.runsVersion}, newer than this build's ${RUN_STORE_VERSION}: no run was loaded and no task will be admitted. Nothing is written to the table either, so the newer build can still read it.`,
            );
            return;
        }
        // Reserved here rather than on the first record write: on a fresh store nothing has been written yet,
        // so without this the very first identity would be handed out uncovered.
        this.#reserveIdentities();
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
    get #resumable(): RunRecord[] {
        return this.internal.runs.resumable;
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
            // A record holds its own slot from load, so only a foreign owner blocks its resume.
            if (owner !== undefined && owner.runId !== record.runId) {
                logger.warn(`Not resuming run ${record.runId}: slot ${record.slotKey} is owned by run ${owner.runId}`);
                continue;
            }
            try {
                const bound = this.internal.registry.interpret(record.type, record.params);
                // A record whose definition cannot be bound stays awaiting resume: it is still unfinished work,
                // and forgetting it would free its slot and hide it from lookup for this process.
                this.#redrive(record, bound);
            } catch (e) {
                logger.error(`Cannot resume run ${record.runId}`, e);
            }
        }
    }

    /**
     * Begin (or resume) driving a live non-terminal run. A `parked` run becomes `running` first: {@link #drive}
     * only advances a running run, and the phase's gate re-parks from live reachability if the peer is still gone.
     *
     * Builds a fresh {@link Execution} so this drive gets its own gate: one recorded for an earlier drive of the
     * same run (e.g. an abort this redrive is recovering from) must not carry over.
     */
    #redrive(record: RunRecord, bound: BoundDefinition): void {
        if (record.state === "parked") {
            record.state = "running";
        }
        const execution = new Execution(record, bound);
        this.internal.runs.attach(execution);
        this.#track(execution);
    }

    #track(execution: Execution): void {
        execution.promise = this.#drive(execution).finally(() => {
            execution.settled = true;
            this.#retire(execution);
        });
    }

    /**
     * Release a settled run: hand back its slot and drop its bookkeeping.
     *
     * The slot is released here rather than when the state turned terminal, because a run is terminal before
     * its driver stops: a re-run admitted any earlier would start writing to the peer while this run's unwind
     * is still in flight. The retirement order is stamped when the outcome is assigned and travels with the
     * write that records it, so nothing is written here.
     */
    #retire(execution: Execution): void {
        // A transition in flight owns this run's outcome, so it owns the retirement too: releasing the target
        // here would admit new work while that transition is still deciding what the run's outcome is.
        if (this.internal.runs.transitionOf(execution.runId) !== undefined) {
            return;
        }
        // A non-terminal run otherwise reaches here through shutdown, which leaves it for the next start. An
        // outcome whose write was refused carries no stamp, so the run keeps its slot rather than retiring
        // behind a record storage does not have.
        if (!isTerminal(execution.record.state) || execution.record.retireSeq === undefined) {
            return;
        }
        this.internal.runs.commitRetirement(execution.record);
    }

    /**
     * Start `type` with `params`. The task's id is derived from type and params, and only one live task may hold
     * it: a caller that passes an `externalId` re-issues its own request idempotently, and any other request for
     * an id a live task already holds is refused rather than silently resolving onto work it did not ask for.
     * The `externalId` is also the id the caller can {@link get} and {@link cancel} its task under.
     *
     * **`externalId` is a correlation key, not an idempotence token.** Only a *live* run holds a name: once a
     * run finishes, re-issuing its name starts the work again. A consumer that needs idempotence keeps its own
     * receipt.
     */
    run<P>(definition: TaskDefinition<P>, params: P, opts?: { externalId?: string }): TaskHandle {
        // Records this build did not read still own their targets, so admitting work would drive a target one
        // of them holds and a later upgrade would then resume it and replay stale values over the result.
        this.#refuseIfUnreadable(`Cannot run "${definition.type}"`);
        // The definition must be the registered one, not merely share its name. Identity is what makes the
        // parameter type mean anything: a different definition of the same name would type its caller's params
        // and then hand them to the registered definition, which declares its own. It is also what stops a
        // lookalike bypassing a registered name's rules, or driving phases a restart could not resume from the
        // name alone.
        if (!this.internal.registry.isRegistered(definition)) {
            throw new ImplementationError(
                this.internal.registry.has(definition.type)
                    ? `Task type "${definition.type}" is registered to a different definition than the one given`
                    : `Task type "${definition.type}" must be registered before it is run`,
            );
        }
        const bound = this.internal.registry.interpret(definition.type, params);
        if (!bound.callerCreatable) {
            throw new ImplementationError(
                `Task type "${definition.type}" undoes another run and is created by cancel(), not by run()`,
            );
        }
        // Structural, not a flag a definition has to remember: admission lets a rollback be admitted while the
        // run it undoes still owns the target, because only cancel creates one and it has already stopped that
        // run's driver. A caller-created undo would take that exception with the original still driving, and
        // the two would rewrite the same intents.
        if (bound.undoes !== undefined) {
            throw new ImplementationError(
                `Task type "${definition.type}" declares what it undoes, so it is created by cancel(), not by run()`,
            );
        }
        const { execution, joined } = this.#spawn(bound, { externalId: opts?.externalId });
        if (!joined) {
            this.#track(execution);
        }
        return this.#handle(execution.record);
    }

    /**
     * Shared creation path so callers (e.g. #prepareRevert) can seed persisted fields before the first persist.
     * Registers a new run as live but does not drive it: a run whose record must be durable before it touches a
     * peer starts with {@link #track} once the write lands.
     */
    #spawn(bound: BoundDefinition, seed: Partial<TaskPersistence>): SpawnedExecution {
        const slotKey = bound.slotKey;
        const runs = this.internal.runs;

        // Steps run in a fixed order because the order decides which refusal a caller sees, and because a
        // slot check that ran before the externalId lookup would turn every join into a conflict. No await
        // anywhere below, so there is no window between the checks and the admission that follows them.

        // 1. Driving started now would outlive the dispose drain and write to peers after close.
        this.#refuseIfClosing(`Task ${slotKey} cannot start`);

        // 2. The slot has one owner, whether or not this process has attached to it. A record awaiting resume
        //    still owns its slot: letting new work take it would leave that run unresumable and its
        //    already-written intents with no owner.
        const owner = runs.ownerOf(slotKey);
        if (owner !== undefined) {
            // Asked before the execution, because a transition outlives one: it may already have handed back
            // this process's responsibility for the run while it is still deciding the outcome.
            const teardown = runs.transitionOf(owner.runId)?.teardown;
            if (teardown !== undefined) {
                throw new TaskSlotDrainingError(
                    `Task ${slotKey} rejected: ${teardown} of ${runLabel(owner.runId)} is still in flight`,
                    owner.runId,
                );
            }
            const ownerExecution = runs.executionOf(owner.runId);
            if (ownerExecution === undefined) {
                throw new TaskSlotAwaitingResumeError(
                    `Task ${slotKey} rejected: ${runLabel(owner.runId)} holds this slot and nothing is driving it (type "${owner.type}")`,
                    owner.runId,
                );
            }
            // Its driver has stopped but its outcome is not durable and it still holds the slot. Joining here
            // would hand back a run nothing is advancing, and re-running would write to the peer while this one
            // is still being recorded.
            if (ownerExecution.settled) {
                throw new TaskSlotSettlingError(
                    `Task ${slotKey} rejected: ${runLabel(owner.runId)} is settling and still holds this slot`,
                    owner.runId,
                );
            }
            if (seed.externalId === undefined || seed.externalId !== owner.externalId) {
                throw new TaskSlotOccupiedError(
                    `Task ${slotKey} rejected: slot held by ${runLabel(owner.runId)} (${owner.state})`,
                    owner.runId,
                );
            }
            return { execution: ownerExecution, joined: true };
        }

        // 3. An external id is one-to-one: a live run of another slot must not lose the name it answers to.
        if (seed.externalId !== undefined) {
            const holder = runs.conflictingExternalIdHolder(seed.externalId, slotKey);
            if (holder !== undefined) {
                throw new TaskExternalIdInUseError(
                    `Task ${slotKey} rejected: external id "${seed.externalId}" names ${runLabel(holder.runId)} of slot ${holder.slotKey}`,
                    holder.runId,
                );
            }
        }

        // 4. A rollback rewrites exactly the intents a re-run would re-apply, so the two must never overlap —
        //    and the rollback in flight need not be undoing the most recent run of the slot.
        const pendingRevert = runs.liveRollbackOfTarget(slotKey);
        if (pendingRevert !== undefined) {
            // A rollback being torn down is about to release this target, so the refusal is transient.
            // Reported here rather than at step 2 because by the time a rollback can be torn down the run it
            // undoes has retired, so nothing owns that run's slot and step 2 never sees it.
            const teardown = runs.transitionOf(pendingRevert.runId)?.teardown;
            if (teardown !== undefined) {
                throw new TaskSlotDrainingError(
                    `Task ${slotKey} rejected: ${teardown} of rollback ${runLabel(pendingRevert.runId)} is still in flight`,
                    pendingRevert.runId,
                );
            }
            throw new TaskRollbackPendingError(
                `Task ${slotKey} rejected: rollback ${runLabel(pendingRevert.runId)} is still in flight and would undo it again`,
                pendingRevert.runId,
            );
        }

        // 5. A rollback contends for the slot of the run it undoes, not for its own: its slot is unique per
        //    run, so checking that alone would let two rollbacks of one slot, or a rollback and the newer run
        //    that now owns the slot, rewrite the same intents at once.
        const undone = bound.undoes;
        if (undone !== undefined) {
            const undoneSlot = runs.get(undone)?.slotKey;
            if (undoneSlot !== undefined) {
                const holder = runs.ownerOf(undoneSlot);
                // A rollback reaches admission only through #prepareRevert — `run()` refuses any definition
                // declaring `undoes` — and cancel has stopped the run's driver by then, so the run still
                // holding its own slot here is expected. Any other holder is live work this rollback would
                // rewrite underneath.
                if (holder !== undefined && holder.runId !== undone) {
                    throw new TaskSlotOccupiedError(
                        `Rollback of ${runLabel(undone)} rejected: slot ${undoneSlot} is held by ${runLabel(holder.runId)}`,
                        holder.runId,
                    );
                }
                const superseder = runs.supersederOf(undone);
                if (superseder !== undefined) {
                    throw new TaskSupersededError(
                        `Rollback of ${runLabel(undone)} rejected: ${runLabel(superseder.runId)} has since committed slot ${undoneSlot}, so the values this would restore are historical`,
                        superseder.runId,
                    );
                }
                const sibling = runs.liveRollbackOfTarget(undoneSlot);
                if (sibling !== undefined) {
                    throw new TaskRollbackPendingError(
                        `Rollback of ${runLabel(undone)} rejected: rollback ${runLabel(sibling.runId)} is already undoing slot ${undoneSlot}`,
                        sibling.runId,
                    );
                }
            }
        }

        const record = new RunRecord(runs.allocate(), slotKey, bound.type, bound.params, seed);
        const execution = new Execution(record, bound);
        runs.admit(record, execution);
        return { execution, joined: false };
    }

    /** Resolve a run: live, awaiting resume, or retired — the record answers all three. */
    get(runId: RunId): TaskHandle | undefined {
        const record = this.internal.runs.get(runId);
        return record === undefined ? undefined : this.#handle(record);
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
        return this.internal.runs.live.map(record => this.#handle(record));
    }

    /** Retired records, newest retirement first. */
    history(limit?: number): TaskHandle[] {
        if (limit !== undefined && !Number.isInteger(limit)) {
            throw new ImplementationError(`history limit must be an integer, got ${limit}`);
        }
        const records = this.internal.runs.retired;
        return (limit === undefined ? records : records.slice(0, Math.max(0, limit))).map(r => this.#handle(r));
    }

    /**
     * A handle reads through the record, which keeps one identity for the run's lifetime — so a held handle
     * keeps answering as the run changes, including changes made after it retired.
     */
    #handle(record: RunRecord): TaskHandle {
        return {
            runId: record.runId,
            get status(): TaskStatus {
                return statusOf(record);
            },
        };
    }

    /**
     * The bound definition for a record: pinned to its driving execution if this process is responsible for
     * it, otherwise resolved through the registry door — which is what lets a run this process is not driving
     * see whatever is registered now, since a record is all that survives a restart.
     */
    #boundFor(record: RunRecord, execution: Execution | undefined): BoundDefinition {
        if (execution !== undefined) {
            return execution.bound;
        }
        if (!this.internal.registry.has(record.type)) {
            throw new TaskTypeNotRegisteredError(
                `Cannot act on ${runLabel(record.runId)}: task type "${record.type}" is not registered`,
            );
        }
        return this.internal.registry.interpret(record.type, record.params);
    }

    /**
     * Start a fresh rollback for a run whose previous one did not finish.
     *
     * A rollback is created by {@link cancel}, so retrying one cannot be an ordinary `run`: only the manager
     * knows the original's driver is stopped and that no other rollback of its slot is in flight.
     *
     * Refuses while the recorded rollback is still going, since that one may yet succeed; while a transition
     * owns it, since that transition decides its outcome; and once it was abandoned, since an operator
     * declining an undo must not be undone by a retry.
     */
    async retryRollback(runId: RunId): Promise<TaskHandle> {
        this.#refuseIfUnreadable(`Cannot retry the rollback of ${runLabel(runId)}`);
        const record = this.internal.runs.get(runId);
        if (record === undefined) {
            throw new TaskNotFoundError(`Cannot retry the rollback of ${runLabel(runId)}: no run answers to it`);
        }
        const recorded = this.internal.runs.rollbackFor(runId);
        if (recorded === undefined) {
            // A state a caller cannot always know rather than a mistake it made: a run may never have produced
            // an undo, and a rollback record that reached storage without a retirement order is discarded at
            // load, leaving the original naming one nothing holds.
            throw new TaskNoRollbackError(`Cannot retry the rollback of ${runLabel(runId)}: it has none`);
        }
        const previous = recorded.runId;
        if (recorded.state === "abandoned") {
            throw new TaskAbandonedError(
                `Cannot retry the rollback of ${runLabel(runId)}: ${runLabel(previous)} was abandoned`,
            );
        }
        // A concluded rollback is detached, so the in-flight checks below would let a replacement through and
        // replay priors onto a device whose undo already succeeded. Same question `abandon` asks, same answer.
        if (undoConcluded(recorded)) {
            throw new TaskAlreadyUndoneError(
                `Cannot retry the rollback of ${runLabel(runId)}: ${runLabel(previous)} already concluded (${recorded.state})`,
            );
        }
        const teardown = this.internal.runs.transitionOf(previous)?.teardown;
        if (teardown !== undefined) {
            throw new TaskRollbackPendingError(
                `Cannot retry the rollback of ${runLabel(runId)}: ${teardown} of ${runLabel(previous)} is still in flight`,
                previous,
            );
        }
        if (this.internal.runs.isAttached(previous)) {
            throw new TaskRollbackPendingError(
                `Cannot retry the rollback of ${runLabel(runId)}: ${runLabel(previous)} is still in flight`,
                previous,
            );
        }

        // Deliberately not through #boundFor: revertibility was decided when the first rollback was created,
        // and asking again would need the original's params, which a retirement drops. A replacement is built
        // from the changeSet alone.
        const revert = this.#spawnRevert(record);
        if (revert.record === undefined) {
            // Cannot happen: a run with a rollback wrote something, and nothing removes a changeSet.
            throw new InternalError(`${runLabel(runId)} has a rollback but nothing to roll back`);
        }
        try {
            await this.#commit({ record, next: { revertRunId: revert.record.runId } }, { record: revert.record });
        } catch (e) {
            revert.discard();
            throw e;
        }
        revert.start();
        return this.#handle(revert.record);
    }

    /**
     * Cancel a task: stop forward driving, then spawn a revert task that rolls back the changeSet as an ordinary
     * task (parks on offline peers, resumes after restart). Does not await the revert — the caller observes it
     * via the returned handle.
     *
     * Applies to work that is still in flight. A run that already finished is refused with
     * {@link TaskNotInFlightError}: its changes are not rewound, because restoring the values it found would
     * overwrite whatever has legitimately happened since — reversing a finished change is a new task the caller
     * starts. A run whose rollback already exists is answered with that rollback, whatever its state.
     *
     * A handle is the rollback. `undefined` means there is nothing to roll back — the run wrote nothing, or it
     * was already cancelled with nothing to undo. {@link TaskNotFoundError} is an identity no run answers to.
     *
     * A rollback is not cancelled: {@link TaskCannotCancelRollbackError} points at {@link abandon}, which
     * records that the undo was given up on rather than that nothing needed it.
     *
     * Throws {@link TaskManagerClosingError} if shutdown intervenes before the cancel can be recorded; the task
     * then keeps its non-terminal state and the cancel must be re-issued after the next start.
     */
    async cancel(runId: RunId): Promise<TaskHandle | undefined> {
        for (let pending = this.#pendingTransition(runId); pending !== undefined;) {
            await pending;
            pending = this.#pendingTransition(runId);
        }
        this.#refuseIfUnreadable(`Cannot cancel ${runLabel(runId)}`);
        const record = this.internal.runs.get(runId);
        if (record === undefined) {
            throw new TaskNotFoundError(`Cannot cancel ${runLabel(runId)}: no run answers to it`);
        }
        // A rollback is ended with `abandon`, which records that the undo was given up on. Cancelling one would
        // leave it `cancelled` — the state a rollback nothing needed ends in — with nothing saying the device
        // was left part-changed.
        if (record.revertOf !== undefined) {
            throw new TaskCannotCancelRollbackError(
                `Cannot cancel ${runLabel(runId)}: it is the rollback of ${runLabel(record.revertOf)}; use abandon() to give up on it`,
            );
        }
        const execution = this.internal.runs.executionOf(runId);

        // The rollback this run already has is the answer, wherever it now lives and whichever representation
        // currently carries it: reporting it as unknown would make re-cancelling fail the moment its rollback
        // finishes, and reading only the durable link would report none while one is being created.
        const existing = this.internal.runs.rollbackFor(runId);
        if (existing !== undefined) {
            this.#refuseIfProvisional(existing, `Cannot answer for the rollback of ${runLabel(runId)}`);
            return this.#handle(existing);
        }
        if (record.state === "cancelled") {
            return undefined;
        }
        // A finished run is not stopped, and its changes are not rewound: restoring the values it found would
        // overwrite whatever has legitimately happened since, so reversing a successful change is a new action
        // the caller starts.
        if (isTerminal(record.state)) {
            throw new TaskNotInFlightError(
                `Cannot cancel ${runLabel(runId)}: it already finished (${record.state}). Reversing a finished change is a new task, not a cancel.`,
            );
        }

        // Deciding on a NEW rollback is the run's decision, so this is the one place an unattached run's type
        // must be registered.
        const bound = this.#boundFor(record, execution);
        if (!bound.revertible(record)) {
            throw new TaskNotRevertibleError(
                `${runLabel(record.runId)} is not revertible: ${bound.notRevertibleReason}`,
            );
        }

        return this.#transition(record, "cancel", async () => {
            // Stop forward driving so the changeset is final before we revert it.
            if (execution !== undefined) {
                await this.#unwind(execution, this.#stopSignal("cancel", record.runId));
            }
            return this.#recordCancellation(record, bound);
        });
    }

    /** The part of a cancel that decides and writes, with this run's outcome already claimed. */
    async #recordCancellation(record: RunRecord, bound: BoundDefinition): Promise<TaskHandle | undefined> {
        // The entry check answered about the run as it was before the unwind. Its driver may have reached an
        // outcome of its own inside the transition window — the loop consults the claim only between phases —
        // and a run that finished is not undone, whichever side of the window it finished on. `abandon` asks
        // the same question at the same point, and for the same reason.
        if (isTerminal(record.state)) {
            const rollback = this.internal.runs.rollbackFor(record.runId);
            if (rollback !== undefined) {
                return this.#handle(rollback);
            }
            throw new TaskNotInFlightError(
                `Cannot cancel ${runLabel(record.runId)}: it finished (${record.state}) while the cancel was being accepted`,
            );
        }

        // Shutdown took over the unwind: state can no longer be persisted, so leave the task non-terminal and
        // unreverted rather than claiming a cancel that storage would contradict on the next start.
        this.#refuseIfClosing(`${runLabel(record.runId)} cannot be cancelled`);

        // Prepared before the state changes: a refused rollback must leave the run as it was, not cancelled in
        // memory and unchanged in storage.
        let revert: PreparedRevert;
        try {
            revert = this.#prepareRevert(record, bound);
        } catch (e) {
            this.#restoreDriver(record, bound);
            throw e;
        }
        // One transaction carries the cancelled state, the retirement order and the rollback that undoes it;
        // the slot moves only once that write is durable.
        try {
            await this.#commit(
                {
                    record,
                    next: {
                        // Unconditional: the terminal check above is what makes it true, so a run reaching its
                        // own outcome inside the window is refused rather than recorded as cancelled.
                        state: "cancelled",
                        retireSeq: this.internal.runs.nextRetirement(record),
                        revertRunId: revert.record?.runId,
                    },
                    drop: RETIRE,
                },
                ...(revert.record === undefined ? [] : [{ record: revert.record }]),
            );
        } catch (e) {
            revert.discard();
            this.#restoreDriver(record, bound);
            throw e;
        }
        this.internal.runs.commitRetirement(record);
        // The rollback mutates peers, so it may not drive before the record that names it is durable.
        revert.start();
        // Resolved from the rollback that exists rather than from what this call prepared: a second cancel that
        // raced this one must be told about the rollback the first created, not told there was nothing to roll
        // back — and it may reach here before the write recording the link has landed.
        const rollback = this.internal.runs.rollbackFor(record.runId);
        return rollback === undefined ? undefined : this.#handle(rollback);
    }

    /**
     * Give up on a rollback whose undo cannot be completed — a node physically removed, so the rollback parks
     * forever, and while it lives nothing new is admitted against the target of the run it undoes.
     *
     * Takes the *rollback's* identity, which a caller holding the original reads from `status.revertRunId`. One
     * verb, one mutation: accepting either identity would make the same call write different records depending
     * on which one the caller happened to hold.
     *
     * The rollback ends {@link TaskState} `abandoned` rather than `cancelled` or `failed`: the device is
     * knowingly left part-changed, which is neither an undo nobody needed nor one worth retrying. Idempotent.
     */
    async abandon(runId: RunId, reason?: string): Promise<TaskHandle> {
        for (let pending = this.#pendingTransition(runId); pending !== undefined;) {
            await pending;
            pending = this.#pendingTransition(runId);
        }
        this.#refuseIfUnreadable(`Cannot abandon ${runLabel(runId)}`);
        const record = this.internal.runs.get(runId);
        if (record === undefined) {
            throw new TaskNotFoundError(`Cannot abandon ${runLabel(runId)}: no run answers to it`);
        }
        if (!this.#needsAbandoning(record)) {
            return this.#handle(record);
        }

        // An abandoned tombstone of a rollback nothing recorded would outlive the transaction that was going
        // to record it.
        this.#refuseIfProvisional(record, `Cannot abandon ${runLabel(runId)}`);
        const execution = this.internal.runs.executionOf(runId);

        return this.#transition(record, "abandon", async () => {
            if (execution !== undefined) {
                await this.#unwind(execution, this.#stopSignal("abandon", runId));
                // Its driver may have reached an outcome of its own inside that window. #retire declined to
                // retire it because this transition owns the run, so retiring it falls here — and before the
                // decision below, which depends on the state the driver left behind.
                //
                // Unconditional on the retirement order, unlike #retire: a terminal record without one is
                // discarded at load, so nothing can resume it and holding its target buys nothing.
                if (isTerminal(record.state)) {
                    this.internal.runs.commitRetirement(record);
                }
            }

            // Shutdown took over: the state cannot be persisted, so leave the rollback as it was rather than
            // claiming an abandonment the next start would contradict.
            this.#refuseIfClosing(`${runLabel(runId)} cannot be abandoned`);

            // The check at entry answered about the run as it was before the unwind. This one is the decision.
            if (!this.#needsAbandoning(record)) {
                return this.#handle(record);
            }

            try {
                await this.#commit({
                    record,
                    next: {
                        state: "abandoned",
                        // Composed rather than replaced: for a rollback that failed on its own, why it could
                        // not finish is what an operator needs to decide what to do about the device.
                        error: this.#abandonReason(record.error, reason),
                        // Absent for a rollback that already retired on its own failure path, which keeps the
                        // place it took then.
                        retireSeq: this.internal.runs.nextRetirement(record),
                    },
                    drop: RETIRE,
                });
            } catch (e) {
                if (execution !== undefined) {
                    this.#restoreDriver(record, execution.bound);
                }
                throw e;
            }
            this.internal.runs.commitRetirement(record);
            return this.#handle(record);
        });
    }

    #abandonReason(failure: string | undefined, reason?: string): string {
        const given = reason === undefined || reason.trim() === "" ? "the undo was abandoned" : reason;
        return failure === undefined ? given : `${failure} (abandoned: ${given})`;
    }

    /**
     * Whether `record` still needs abandoning, throwing if it may not be.
     *
     * Asked twice — as an entry filter, and again after the unwind, where it is the decision, because a driver
     * can reach an outcome of its own in between.
     */
    #needsAbandoning(record: RunRecord): boolean {
        if (record.state === "abandoned") {
            return false;
        }
        if (record.revertOf === undefined) {
            const rollback = this.internal.runs.rollbackFor(record.runId)?.runId;
            throw new TaskNotARollbackError(
                rollback === undefined
                    ? `Cannot abandon ${runLabel(record.runId)}: it is not a rollback`
                    : `Cannot abandon ${runLabel(record.runId)}: it is not a rollback; its rollback is ${runLabel(rollback)}`,
            );
        }
        // Another rollback applies to this target now, so abandoning this one forecloses nothing and would
        // record that an undo still in progress was given up on.
        const undone = this.internal.runs.get(record.revertOf);
        const applicable = undone === undefined ? undefined : this.internal.runs.rollbackApplyingTo(undone);
        if (applicable !== undefined && applicable.runId !== record.runId) {
            this.#refuseIfProvisional(applicable, `Cannot abandon ${runLabel(record.runId)}`);
            throw new TaskSupersededError(
                `Cannot abandon ${runLabel(record.runId)}: ${runLabel(applicable.runId)} is the rollback that now applies to ${undone?.slotKey ?? "its target"}`,
                applicable.runId,
            );
        }
        if (undoConcluded(record)) {
            throw new TaskAlreadyUndoneError(
                `Cannot abandon ${runLabel(record.runId)}: the undo already concluded (${record.state})`,
            );
        }
        return true;
    }

    /**
     * Stop driving `execution` and wait for its driver to notice, so the caller owns what happens next.
     *
     * Flipping a record's state does not stop a driver: it is sitting in an `await` and will wake and keep
     * writing. Awaiting it is the only way to know nothing is still writing to the peer when the caller decides
     * the run's outcome.
     */
    async #unwind(execution: Execution, signal: TaskStopSignal): Promise<void> {
        execution.abort(signal);
        await execution.promise;
    }

    /**
     * Run a transition as the exclusive owner of this run's outcome, refusing if another already owns it.
     *
     * Exclusive because a transition stops the driver and only then decides: two of them would decide from the
     * same pre-transition state, and the loser would either write over the winner's outcome or restore a
     * second driver over one record. Held for the whole transition rather than for the unwind, so a request
     * that arrives after the driver stopped but before the write lands is still told the target is draining.
     */
    async #transition<T>(record: RunRecord, teardown: Teardown, body: () => Promise<T>): Promise<T> {
        const held = this.internal.runs.claimTransition(record.runId, teardown);
        if (held !== undefined) {
            // Only reachable if a verb skipped #pendingTransition; claiming twice is what this exists to stop.
            throw new InternalError(`${runLabel(record.runId)}: ${held.teardown} of it already owns its outcome`);
        }
        try {
            return await body();
        } finally {
            this.internal.runs.releaseTransition(record.runId);
        }
    }

    /**
     * A transition already deciding this run's outcome, for a caller to wait out before deciding itself.
     *
     * A duplicate request is owed the first one's answer — a second cancel is owed the rollback the first
     * created, a second abandon the handle — so waiting is right where refusing would make the answer depend on
     * scheduling.
     *
     * Deliberately synchronous, and deliberately not a helper that awaits: a verb that awaited even when
     * nothing was pending would yield before its own claim, which is exactly the window that lets two callers
     * claim one run.
     */
    #pendingTransition(runId: RunId): Promise<void> | undefined {
        return this.internal.runs.transitionOf(runId)?.settled;
    }

    /**
     * Refuse a request whose answer would be a run that storage may yet contradict.
     *
     * A rollback is admitted before the transaction naming it lands, and that transaction can be refused — its
     * producer then discards it as never having existed. Handing back a handle for such a run, or calling
     * another run superseded because of it, states as fact something the next start would deny. Transient by
     * construction: the next attempt finds it durable, or finds it gone.
     *
     * Asked of every answer derived from a rollback, so no call site has to remember the window.
     */
    #refuseIfProvisional(record: RunRecord, subject: string): void {
        if (!record.recorded) {
            throw new TaskSlotSettlingError(`${subject}: ${runLabel(record.runId)} is not recorded yet`, record.runId);
        }
    }

    /** The stop a driver sees, matching the verb that took over. Never a plain error: #drive would fail the run. */
    #stopSignal(teardown: Teardown, runId: RunId): TaskStopSignal {
        return teardown === "cancel"
            ? new TaskCancelledSignal(`${runLabel(runId)} cancelled`)
            : new TaskAbandonedSignal(`${runLabel(runId)} abandoned`);
    }

    /**
     * Give back the driver an unwind stopped, for a transition the manager then declined.
     *
     * A run that keeps its state must keep its driver too, or it sits non-terminal with nothing left to advance
     * it. A run this process was never attached to never had a driver here, and driving it would write
     * reconstructed state over whatever the record now holds.
     */
    #restoreDriver(record: RunRecord, bound: BoundDefinition): void {
        // A driver started now would sit outside the dispose drain, which has already taken its snapshot of
        // what to abort and await. The run keeps its state and the next start resumes it.
        if (this.#isClosing) {
            return;
        }
        if (this.internal.runs.isAttached(record.runId)) {
            this.#redrive(record, bound);
        }
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

    /** Create (or reuse) the revert task for `record`, linking both directions, without driving it. */
    #prepareRevert(record: RunRecord, bound: BoundDefinition): PreparedRevert {
        // A failed rollback surfaces as `failed` for operator attention; rolling one back would recurse
        // unbounded. Keyed on the link rather than on the type, so it is the same question `cancel` and
        // `abandon` ask: any definition declaring `undoes` produces a run that undoes another.
        if (record.revertOf !== undefined) {
            return NO_REVERT;
        }
        // Past a run's point of no return there is nothing to roll back to; suppress auto-rollback too.
        if (!bound.revertible(record)) {
            return NO_REVERT;
        }
        // Already rolled back once, or being rolled back right now: cancel resolves that rollback itself, so
        // there is nothing to prepare, write or start here. Asking the table rather than the run's own link
        // covers the window before the write recording that link has landed, where a second cancel would
        // otherwise try to create a rollback of its own.
        if (this.internal.runs.rollbackFor(record.runId) !== undefined) {
            return NO_REVERT;
        }
        return this.#spawnRevert(record);
    }

    /**
     * Build the rollback of `record` from its changeSet alone.
     *
     * The half of a rollback that needs nothing but the record: what a replacement rollback needs, and what a
     * retirement's dropped params must not stand in the way of.
     */
    #spawnRevert(record: RunRecord): PreparedRevert {
        if (record.changeSet.length === 0) {
            return NO_REVERT;
        }
        // `revertOf` is seeded on every rollback the manager creates, retries included: it is the identity
        // link that refuses a re-run of the original, and a rollback that lacks it excludes nothing.
        const { execution: revert, joined } = this.#spawn(
            new BoundDefinition(Revert, { originalRunId: record.runId, entries: record.changeSet }),
            { revertOf: record.runId },
        );
        // The link is not set here: it is part of the state the caller's write carries, so a refused write
        // leaves the run not naming a rollback that was never recorded.
        // A joined rollback is already live and driving, so it is not ours to start or to forget.
        if (joined) {
            return { record: revert.record, discard() {}, start() {} };
        }
        return {
            record: revert.record,
            discard: () => this.internal.runs.discard(revert.record),
            start: () => this.#track(revert),
        };
    }

    /** Throw a recorded abort (a cancel, an abandon or shutdown) so the driver stops before it writes. */
    #throwIfAborted(execution: Execution): void {
        const aborted = execution.gate.aborted;
        if (aborted !== undefined) {
            throw asError(aborted);
        }
    }

    /**
     * Reject a task before any node mutation if its planned changes would overflow a target's device capacity.
     * Runs before the first persist/phase; the thrown error ends the task `failed` with an empty changeSet.
     */
    async #admit(execution: Execution): Promise<void> {
        const planned = execution.bound.plannedChanges();
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
                    `${runLabel(execution.runId)}: ${kind} on ${peerId} exceeds capacity — needs ${added} slot(s) but only ${capacity.limit - capacity.used} free`,
                );
            }
        }
    }

    async #drive(execution: Execution): Promise<void> {
        const record = execution.record;
        try {
            await this.#admit(execution); // fail-fast before any node is touched
            this.#throwIfAborted(execution);
            // Recorded before the first phase so a crash-resume sees the run.
            await this.#commit({ record });
            while (record.phaseIndex < execution.phases.length && record.state === "running") {
                const phase = execution.phases[record.phaseIndex];
                const ctx = await this.endpoint.act(agent => this.#contextFor(execution, this.taskReconciler(agent)));
                // A phase mutates the peer before it reaches its gate, so this is the last point at which an
                // abort accepted meanwhile can still prevent the write.
                this.#throwIfAborted(execution);
                await phase.run(ctx);
                // A cancel accepted while the phase ran must leave phaseIndex on that phase: revertibility is
                // phase-based, so advancing it can cross a task's point of no return and suppress the rollback.
                const teardown = this.internal.runs.transitionOf(execution.runId)?.teardown;
                if (teardown !== undefined) {
                    throw this.#stopSignal(teardown, record.runId);
                }
                await this.#commit({ record, next: { phaseIndex: record.phaseIndex + 1 } });
            }
            if (record.state === "running") {
                // One write carries the outcome and its place in the retirement order.
                await this.#commit({
                    record,
                    next: { state: "completed", retireSeq: this.internal.runs.nextRetirement(record) },
                    drop: RETIRE,
                });
            }
        } catch (e) {
            // Shutdown leaves the task non-terminal for resume; cancel is finalized by cancel() itself.
            // The signal classes are public, so a phase can throw one the manager never asked for. Honoring
            // that would leave the run non-terminal with nothing driving it and its target held for the life of
            // the process, so authority is what counts: the recorded abort, or a transition that owns the run.
            if (
                e instanceof TaskStopSignal &&
                (e === execution.gate.aborted || this.internal.runs.transitionOf(execution.runId) !== undefined)
            ) {
                return;
            }
            // Teardown: neither the failure nor a rollback of it can be recorded, and the rollback's driving would
            // outlive the dispose drain. Leave the task as the next start can resume it.
            if (this.#isClosing) {
                logger.warn(
                    `${runLabel(record.runId)} interrupted by shutdown; its persisted state is left for the next start`,
                    e,
                );
                return;
            }
            const error = e instanceof Error ? e.message : String(e);
            logger.error(`${runLabel(record.runId)} failed`, e);
            // Neither a rollback this manager refuses nor a failing persist may re-reject the (otherwise handled)
            // drive promise: that turns into an unhandled rejection and a cancel awaiting this task throws.
            let revert = NO_REVERT;
            try {
                revert = this.#prepareRevert(record, execution.bound);
            } catch (revertError) {
                logger.error(`${runLabel(record.runId)}: cannot roll back`, revertError);
            }
            // The failure, its place in the retirement order and the rollback that undoes it land together, or
            // not at all: written separately, a crash between them leaves a run promising a rollback nothing
            // created.
            try {
                await this.#commit(
                    {
                        record,
                        next: {
                            state: "failed",
                            error,
                            retireSeq: this.internal.runs.nextRetirement(record),
                            revertRunId: revert.record?.runId,
                        },
                        drop: RETIRE,
                    },
                    ...(revert.record === undefined ? [] : [{ record: revert.record }]),
                );
            } catch (persistError) {
                revert.discard();
                logger.error(`${runLabel(record.runId)}: failed to persist failure state`, persistError);
                // Nothing of this run ever reached storage, so it leaves no trace: holding a slot for a run
                // no restart can find would block that target for the life of the process. The record carries
                // its outcome out with it, so the handle its caller already holds says what happened — the one
                // place memory may differ from storage, because there is no longer a record to differ from.
                if (!record.recorded) {
                    record.state = "failed";
                    record.error = error;
                    this.internal.runs.discard(record);
                }
                return;
            }
            // The rollback mutates peers, so it may not drive before the record that names it is durable.
            revert.start();
        }
    }

    #contextFor(execution: Execution, reconciler: ReconcilerBehavior): RunningTaskContext {
        const record = execution.record;
        const setState = (state: TaskState) => {
            // Terminal states are owned by #drive; gates only flip between running/parked.
            if (record.state === state || (record.state !== "running" && record.state !== "parked")) {
                return;
            }
            // Advisory, so memory leads and the write trails: the driver's loop reads this synchronously, and
            // waiting for a write to land would let it see a stale `parked` after the gate resolved and stop
            // with nothing left to advance the run. A lost note costs nothing — resume re-derives it.
            record.state = state;
            this.#mutex.run(() => this.#writeRecords([{ record }]));
        };
        return new RunningTaskContext(
            record,
            id => this.resolvePeerNode(id),
            reconciler,
            setState,
            this.#gateFor(execution.gate),
            () => [...this.#rootNode.peers],
        );
    }

    /** Per-task gate control: cancel/shutdown set `aborted`; `onAbort` wakes a parked gate to observe it. */
    #gateFor(gate: GateState): GateControl {
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

    /**
     * Refuse while the stored table was written by a newer build.
     *
     * Every verb that would *write*, not only `run`: nothing was loaded, so `cancel` of a run that
     * demonstrably exists in storage would otherwise answer "no run answers to it" — a wrong answer where a
     * refusal naming the cause is available. The read verbs still answer from an empty table; they cannot
     * invent a record, but they cannot explain themselves either.
     */
    #refuseIfUnreadable(subject: string): void {
        if (this.internal.runs.unreadable) {
            throw new TaskStoreVersionError(
                `${subject}: the stored run table is at schema version ${this.state.runsVersion}, newer than this build's ${RUN_STORE_VERSION}`,
            );
        }
    }

    // Serialized through the mutex: a spawned revert drives (and persists) concurrently with the original's
    // own persist, so direct concurrent state writes would conflict on the synchronous transaction lock.
    /**
     * Record these runs' intended next state in one transaction, and adopt it only once the write has landed.
     *
     * The unit is the transaction, not the field: a run's outcome and its place in the retirement order must
     * land together or a crash between them leaves a record that load discards, and a run and the rollback it
     * names must land together or the run promises a rollback nothing created.
     *
     * Nothing is mutated before the write, so a refused write needs no compensation — the run is as it was
     * because it was never changed.
     */
    async #commit(...changes: RunChange[]): Promise<void> {
        await this.#mutex.produce(() => this.#writeRecords(changes));
    }

    async #writeRecords(changes: RunChange[]): Promise<void> {
        // Serialized with the write, so a shutdown that began while this queued behind the mutex cannot slip past.
        this.#refuseIfClosing(`${runLabel(changes[0].record.runId)} state cannot be recorded`);
        // Only the named runs are written. Republishing the whole table from memory would erase records this
        // process never loaded — a persisted run whose type nothing has registered yet — and would publish
        // other runs' uncommitted in-flight state as though it were durable.
        //
        // Built here rather than at the call site: a snapshot taken before this write queued would carry state
        // an earlier transition has since superseded.
        const records = changes.map(
            change => [runKey(change.record.runId), change.record.toPersistence(change.next, change.drop)] as const,
        );
        const nextRetireSeq = this.internal.runs.nextRetireSeq;
        const reservedRunId = this.internal.runs.reservedRunId;
        await this.endpoint.act(agent => {
            const self = agent.get(TaskManagerBehavior);
            const runs = { ...self.state.runs };
            for (const [key, persisted] of records) {
                runs[key] = persisted;
            }
            self.state.runs = runs;
            // High-water marks: never `consumed + 1`, or a write that lands out of allocation order lowers the
            // counter below a durable identity and a crash re-issues it.
            self.state.nextRunId = Math.max(self.state.nextRunId, reservedRunId);
            self.state.nextRetireSeq = Math.max(self.state.nextRetireSeq, nextRetireSeq);
            // Stamped with every write rather than once at start: the table and the version that describes it
            // then land together, so no crash leaves records a later build reads under the wrong version.
            self.state.runsVersion = RUN_STORE_VERSION;
        });
        // Only now: a value adopted before the write survives a write that never landed. The reservation would
        // let the next identity be issued beyond what storage covers, and a run would carry state its record
        // does not have.
        this.internal.runs.noteReserved(reservedRunId);
        for (const change of changes) {
            // Durable from this write on, whichever run of the transaction it belongs to: a rollback recorded
            // alongside the run it undoes is as durable as that run, and discarding it later would leave the
            // original naming a rollback nothing holds.
            change.record.recorded = true;
            for (const [key, value] of Object.entries(change.next ?? {})) {
                if (value !== undefined) {
                    Object.assign(change.record, { [key]: value });
                }
            }
            change.record.adoptDrop(change.drop ?? []);
        }
    }

    override async [Symbol.asyncDispose]() {
        const executions = this.internal.runs.executions;
        // Suspend in-flight gates so parked tasks stop cleanly (non-terminal, resumable) instead of hanging close.
        for (const execution of executions) {
            execution.abort(new TaskSuspendedSignal(`${runLabel(execution.runId)} suspended on shutdown`));
        }
        await Promise.allSettled(executions.map(execution => execution.promise));
        await this.internal.persistMutex?.close();
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace TaskManagerBehavior {
    export class State {
        runs: Record<string, TaskPersistence> = {};
        nextRunId = 1;
        nextRetireSeq = 1;
        runsVersion = 1;
    }

    export class Internal {
        registry!: TaskRegistry;
        runs!: RunStore;
        persistMutex?: Mutex;
    }

    export class Events extends Behavior.Events {}
}
