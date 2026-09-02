/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";
import type { RunId } from "./types.js";

/**
 * Why a request was refused, as a value rather than as prose.
 *
 * A user interface must render a refusal in the reader's language, which a pre-formatted English message cannot
 * survive. String values, never implicit numerics: a code is logged, and inserting a member must not renumber
 * the rest.
 */
export enum TaskFindingCode {
    /** A live run holds the target. */
    SlotOccupied = "slotOccupied",

    /** A cancel or abandon of the run holding the target is unwinding. Transient. */
    SlotDraining = "slotDraining",

    /** Nothing is advancing the run — stopped, or never started — and its outcome is not durable yet. */
    SlotSettling = "slotSettling",

    /**
     * The target's owner exists but nothing in this process is driving it.
     *
     * Deliberately promises no remedy: its type may be unregistered, the resume pass may not have run yet, or
     * the record's stored parameters may have been refused.
     */
    SlotAwaitingResume = "slotAwaitingResume",

    /** The requested external id names a live run of a different target. */
    ExternalIdInUse = "externalIdInUse",

    /** A rollback of the target is in flight and would undo the request's own writes. */
    RollbackPending = "rollbackPending",

    /** A later run has committed the target, so what this request would restore is historical. */
    Superseded = "superseded",

    /** The run's task type is not registered, so the question cannot be answered from the record alone. */
    TypeNotRegistered = "typeNotRegistered",

    /** The manager is shutting down and cannot record an outcome. */
    ManagerClosing = "managerClosing",

    /** No run answers the given identity. */
    NotFound = "notFound",

    /** The run has passed its point of no return. */
    NotRevertible = "notRevertible",

    /** More runs were started than the durable identity reservation covers. */
    IdentityExhausted = "identityExhausted",

    /** The identity names a run that is not a rollback. */
    NotARollback = "notARollback",

    /** The undo already concluded, so there is nothing to abandon. */
    AlreadyUndone = "alreadyUndone",

    /** The rollback was abandoned; an operator declined this undo. */
    Abandoned = "abandoned",

    /** A rollback is ended with `abandon`, not with `cancel`. */
    CannotCancelRollback = "cannotCancelRollback",

    /** The run already finished, so there is nothing to stop. */
    NotInFlight = "notInFlight",

    /** The stored run table was written by a newer build than this one. */
    StoreVersion = "storeVersion",

    /** The run has no undo to retry. */
    NoRollback = "noRollback",
}

export class TaskError extends MatterError {}

/**
 * A request the manager refused, carrying {@link TaskFindingCode} so a caller acts on the cause rather than on
 * the message.
 *
 * An error that ends a *run* is not a refusal and carries no code: nobody is waiting to be told why.
 */
export abstract class TaskRefusedError extends TaskError {
    abstract readonly code: TaskFindingCode;
}

/** A task referenced a peer that is not commissioned / not present. */
export class TaskPeerUnavailableError extends TaskError {}

/** A task's forward work failed terminally; the manager spawns a rollback to undo its changeSet. */
export class TaskFailedError extends TaskError {}

/** A task's planned changes would exceed a node's device capacity for some item kind. */
export class TaskCapacityExceededError extends TaskError {}

/** A task refused to run because a member's current intent violates a required precondition. */
export class RotationPreconditionError extends TaskError {}

/** cancel() was refused: the task passed its point of no return (e.g. a realized group-key rotation). */
export class TaskNotRevertibleError extends TaskRefusedError {
    override readonly code = TaskFindingCode.NotRevertible;
}

/**
 * A request was refused because other work holds what it asked for: the target it would change, or the external
 * id it would answer to.
 *
 * {@link owner} names the run responsible, so a caller can act on it without parsing the message. Which run
 * that is follows the {@link code}: usually the one holding the target; for
 * {@link TaskFindingCode.Superseded} the run whose outcome makes the request pointless; and for
 * {@link TaskFindingCode.SlotSettling} the run whose outcome is not durable yet, which may be the subject of
 * the request itself.
 */
export abstract class TaskConflictError extends TaskRefusedError {
    constructor(
        message: string,
        readonly owner: RunId,
    ) {
        super(message);
    }
}

/** A live run holds the target this request would change. */
export class TaskSlotOccupiedError extends TaskConflictError {
    override readonly code = TaskFindingCode.SlotOccupied;
}

/** A cancel or abandon of the run holding the target is still unwinding. Transient: retry. */
export class TaskSlotDrainingError extends TaskConflictError {
    override readonly code = TaskFindingCode.SlotDraining;
}

/** Nothing is advancing the run whose outcome the request waits on, and that outcome is not durable yet. */
export class TaskSlotSettlingError extends TaskConflictError {
    override readonly code = TaskFindingCode.SlotSettling;
}

/** The target's owner exists, but nothing in this process is driving it. */
export class TaskSlotAwaitingResumeError extends TaskConflictError {
    override readonly code = TaskFindingCode.SlotAwaitingResume;
}

/** The requested external id already names a live run of a different target. */
export class TaskExternalIdInUseError extends TaskConflictError {
    override readonly code = TaskFindingCode.ExternalIdInUse;
}

/** A rollback of the target is in flight; it rewrites exactly the intents this request would apply. */
export class TaskRollbackPendingError extends TaskConflictError {
    override readonly code = TaskFindingCode.RollbackPending;
}

/** A later run has committed the target, so the values this request would restore are historical. */
export class TaskSupersededError extends TaskConflictError {
    override readonly code = TaskFindingCode.Superseded;
}

/** No run answers to the given identity, so there is nothing to observe or act on. */
export class TaskNotFoundError extends TaskRefusedError {
    override readonly code = TaskFindingCode.NotFound;
}

/**
 * Deciding on a *new* rollback needs the run's task type registered, because whether a run may be rolled back
 * is a decision of the task, not of its record. Reached by `cancel` of a run awaiting resume — one whose record
 * outlived the process that registered its type. Retrying an existing rollback asks nothing of the task and so
 * needs no registration.
 */
export class TaskTypeNotRegisteredError extends TaskRefusedError {
    override readonly code = TaskFindingCode.TypeNotRegistered;
}

/**
 * More runs were started than the durable identity reservation covers, before any of their records landed.
 * Handing out an unreserved identity would let the next start re-issue it, so the request is refused instead.
 */
export class TaskIdentityExhaustedError extends TaskRefusedError {
    override readonly code = TaskFindingCode.IdentityExhausted;
}

/**
 * A request was refused because the manager is shutting down and could not record its outcome. The run keeps
 * the non-terminal state it had, so the request must be re-issued after the next start.
 */
export class TaskManagerClosingError extends TaskRefusedError {
    override readonly code = TaskFindingCode.ManagerClosing;
}

/** `abandon()` names the rollback to give up on, not the run it undoes. */
export class TaskNotARollbackError extends TaskRefusedError {
    override readonly code = TaskFindingCode.NotARollback;
}

/**
 * `abandon()` was refused because the undo already concluded: it either restored the device, or was called off
 * before it wrote anything. Nothing is left for an operator to give up on.
 */
export class TaskAlreadyUndoneError extends TaskRefusedError {
    override readonly code = TaskFindingCode.AlreadyUndone;
}

/** An operator abandoned this rollback, so it is not retried: the device is knowingly left in between. */
export class TaskAbandonedError extends TaskRefusedError {
    override readonly code = TaskFindingCode.Abandoned;
}

/**
 * A rollback is not cancelled. Cancelling one would record it as called off before it mattered, which is
 * indistinguishable from a rollback nothing needed; `abandon()` says the device is knowingly inconsistent.
 */
export class TaskCannotCancelRollbackError extends TaskRefusedError {
    override readonly code = TaskFindingCode.CannotCancelRollback;
}

/**
 * `cancel()` stops work that is still in flight. A finished run is not stopped, and its changes are not
 * rewound: reversing a change that succeeded is a new action a caller starts, because restoring the values the
 * run found would overwrite whatever has legitimately happened since.
 */
export class TaskNotInFlightError extends TaskRefusedError {
    override readonly code = TaskFindingCode.NotInFlight;
}

/**
 * There is no undo of this run to retry: it never produced one — nothing was written, or the task declined to
 * be reverted — or the record of the one it had did not survive a restart.
 *
 * Ordinary state rather than a caller's mistake, and reachable more often since a cleanly completed run no
 * longer gets a rollback at all.
 */
export class TaskNoRollbackError extends TaskRefusedError {
    override readonly code = TaskFindingCode.NoRollback;
}

/**
 * The stored run table carries a schema version this build does not know, so its records were not loaded and
 * no new work is admitted: driving new runs against targets those records own would write over work this build
 * cannot see, and a later upgrade would then resume them and replay stale values.
 */
export class TaskStoreVersionError extends TaskRefusedError {
    override readonly code = TaskFindingCode.StoreVersion;
}

/**
 * A stop the manager owns, seen by a task's phases as a thrown error. Rethrow if you catch one: swallowing it
 * drives a run whose fate the manager has already decided.
 */
export class TaskStopSignal extends TaskError {}

/** Thrown into a running phase when a cancel is accepted, so #drive stops cleanly (not "failed"). */
export class TaskCancelledSignal extends TaskStopSignal {}

/** Thrown into a running phase when a rollback is abandoned, so #drive stops without recording a failure. */
export class TaskAbandonedSignal extends TaskStopSignal {}

/** Thrown into a running phase on shutdown so #drive stops without a state change (resume later). */
export class TaskSuspendedSignal extends TaskStopSignal {}
