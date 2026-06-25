/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";

export class TaskError extends MatterError {}

/** A task referenced a peer that is not commissioned / not present. */
export class TaskPeerUnavailableError extends TaskError {}

/** A task's forward work failed terminally (no auto-rollback in this increment). */
export class TaskFailedError extends TaskError {}

/** A cancel could not revert the task's changes (reserved; not reachable by AddNodeToGroup). */
export class TaskCancelFailedError extends TaskError {}
