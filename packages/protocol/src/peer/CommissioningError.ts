/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RetransmissionLimitReachedError } from "#protocol/errors.js";
import { MatterError } from "@matter/general";

/**
 * Error that throws when Commissioning fails and a process cannot be continued, and no more specific error
 * information is available.
 */
export class CommissioningError extends MatterError {}

/**
 * Thrown when PASE pairing fails because no candidate address responded before the timeout or retransmission limit.
 */
export class PairRetransmissionLimitReachedError extends RetransmissionLimitReachedError {}
