/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";

/**
 * A command an out-of-process controller reported as failed without telling why, so a step cannot attribute the
 * failure to the device or to the controller.
 *
 * Only an adapter whose controller gives no cause subclasses it. An adapter that learns the cause maps the failure to a
 * typed error instead, so a test-case helper that accepts this base never accepts a failure whose cause is known.
 */
export class ControllerCommandError extends MatterError {}
