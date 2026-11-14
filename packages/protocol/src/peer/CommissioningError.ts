/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RetransmissionLimitReachedError } from "#protocol/errors.js";
import { ImplementationError, MatterError } from "@matter/general";

/**
 * Error that throws when Commissioning fails and a process cannot be continued, and no more specific error
 * information is available.
 */
export class CommissioningError extends MatterError {}

/**
 * Thrown when PASE pairing fails because no candidate address responded before the timeout or retransmission limit.
 */
export class PairRetransmissionLimitReachedError extends RetransmissionLimitReachedError {}

/**
 * Thrown before PASE when the CASE admin subject of a commissioning is not a valid Access Control subject, or when our
 * NOC does not satisfy it and no `finalizeCommissioning` hook is set.  The device would refuse the first case in AddNOC.  In the second case the device grants
 * Administer only to that subject, so CommissioningComplete over our CASE session fails and the device removes the
 * fabric when the fail-safe expires.
 *
 * This is an {@link ImplementationError}, not a {@link CommissioningError}: the options are wrong for every device, so
 * retrying with another device does not help.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.18.6.8.4
 * @see {@link MatterSpecification.v161.Core} § 6.6.2.1.2
 */
export class CaseAdminSubjectError extends ImplementationError {}
