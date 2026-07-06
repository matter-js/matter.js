/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";

export class TaskError extends MatterError {}

/** A task referenced a peer that is not commissioned / not present. */
export class TaskPeerUnavailableError extends TaskError {}

/** A task's forward work failed terminally; the manager spawns a revert task to roll back its changeSet. */
export class TaskFailedError extends TaskError {}

/** A task's planned changes would exceed a node's device capacity for some item kind. */
export class TaskCapacityExceededError extends TaskError {}

/** Internal signal a running gate throws when cancel is requested, so #drive stops cleanly (not "failed"). */
export class TaskCancelledSignal extends TaskError {}

/** Internal signal a running gate throws on shutdown so #drive stops without a state change (resume later). */
export class TaskSuspendedSignal extends TaskError {}
