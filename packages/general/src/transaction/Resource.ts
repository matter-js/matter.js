/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Transaction } from "./Transaction.js";

/**
 * A transaction resource is the target a {@link Participant} is mutating. The {@link Coordinator} tracks the state of
 * resources to ensure only a single transaction ever has exclusive access.
 */
export interface Resource {
    /**
     * Textual description of the resource used in error messages.
     */
    toString(): string;

    /**
     * Locking transaction, maintained by {@link Transaction}.
     */
    lockedBy?: Transaction;

    /**
     * Inform {@link Transaction} this resource is a standin for another resource.
     */
    [Resource.reference]?: Resource;
}

export namespace Resource {
    export const reference = Symbol("reference");

    export function isLocked(resource: Resource) {
        while (resource[Resource.reference] !== undefined) {
            resource = resource[Resource.reference];
        }
        return resource.lockedBy !== undefined;
    }
}
