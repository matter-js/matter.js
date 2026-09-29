/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";

/**
 * A group message cannot be sent because the fabric holds no usable key for the group. This is the sender's group
 * provisioning (GroupKeyManagement KeySetWrite and GroupKeyMap, or Groupcast JoinGroup) being incomplete or not yet in
 * effect, not a fault of the code sending.
 *
 * @see {@link MatterSpecification.v16.Core} § 4.16.2
 */
export class NoUsableGroupKeyError extends MatterError {}

/** The fabric maps no key set to the group, or maps it to a key set it does not hold. */
export class GroupKeySetMissingError extends NoUsableGroupKeyError {}

/**
 * Every epoch key of the group's key set starts in the future, so there is no current key to send with.
 *
 * @see {@link MatterSpecification.v16.Core} § 4.17.3
 */
export class GroupKeyNotStartedError extends NoUsableGroupKeyError {}
