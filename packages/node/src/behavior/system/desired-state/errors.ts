/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";

/** Base for all node-manager errors the controller cannot resolve on its own. */
export class NodeManagerError extends MatterError {}

export class UnknownItemKindError extends NodeManagerError {}

export class DuplicateItemKindError extends NodeManagerError {}

/**
 * Raised when adding an item would exceed a device's per-fabric limit. Surfaced to the user —
 * not fixable by the controller alone.
 */
export class CapacityExceededError extends NodeManagerError {
    constructor(
        readonly kind: string,
        readonly limit: number,
        readonly used: number,
        readonly requested: number,
    ) {
        super(`Cannot add ${requested} "${kind}" item(s): would exceed device limit (${used}/${limit} used)`);
    }
}

export class AclCapacityExceededError extends CapacityExceededError {}

export class GroupCapacityExceededError extends CapacityExceededError {}

export class GroupKeyCapacityExceededError extends CapacityExceededError {}
