/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "#general";

/**
 * Error that throws when Commissioning fails and a process cannot be continued, and no more specific error
 * information is available.
 */
export class CommissioningError extends MatterError {}
