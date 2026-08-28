/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";
import type { RunId } from "./types.js";

export class TaskError extends MatterError {}

/** A task referenced a peer that is not commissioned / not present. */
export class TaskPeerUnavailableError extends TaskError {}

/** A task's forward work failed terminally; the manager spawns a revert task to roll back its changeSet. */
export class TaskFailedError extends TaskError {}

/** A task's planned changes would exceed a node's device capacity for some item kind. */
export class TaskCapacityExceededError extends TaskError {}

/** cancel() was refused: the task passed its point of no return (e.g. a realized group-key rotation). */
export class TaskNotRevertibleError extends TaskError {}

/**
 * A request was refused because live work already holds the slot it targets, or the external id it asked for,
 * or is rolling that work back. {@link owner} names the run responsible, so a caller can act on it without
 * parsing the message.
 */
export class TaskConflictError extends TaskError {
    constructor(
        message: string,
        readonly owner?: RunId,
    ) {
        super(message);
    }
}

/** No run answers to the given name, so there is nothing to observe or act on. */
export class TaskNotFoundError extends TaskError {}

/**
 * Undo of a finished run needs its task type registered, because whether a run may be rolled back is a
 * decision of the task, not of its record.
 */
export class TaskTypeNotRegisteredError extends TaskError {}

/** A task refused to run because a member's current intent violates a required precondition. */
export class RotationPreconditionError extends TaskError {}

/**
 * A request was refused because the manager is shutting down and could not record its outcome. A cancelled task
 * keeps the non-terminal state it had, so the request must be re-issued after the next start.
 */
export class TaskManagerClosingError extends TaskError {}

/** Internal signal a running gate throws when cancel is requested, so #drive stops cleanly (not "failed"). */
export class TaskCancelledSignal extends TaskError {}

/** Internal signal a running gate throws on shutdown so #drive stops without a state change (resume later). */
export class TaskSuspendedSignal extends TaskError {}
