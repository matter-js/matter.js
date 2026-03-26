/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AccessControl, Val } from "@matter/protocol";

/**
 * A Reference offers a simple mechanism for referring to properties by reference.
 *
 * This was originally defined as `Val.Reference` in `@matter/protocol` but is only consumed within `@matter/node`.
 */
export interface ValReference<T extends Val = Val> {
    /**
     * The current value of the referenced property.  Cleared when the reference is no longer functional.
     */
    value: T;

    /**
     * The current canonical value of the referenced property.
     */
    readonly original: T;

    /**
     * When true, the reference is no longer usable because the owning context has exited.
     */
    readonly expired: boolean;

    /**
     * Diagnostic path to the referenced value.
     */
    location: AccessControl.Location;

    /**
     * Active references to child properties.
     */
    subrefs?: Record<number | string, ValReference>;

    /**
     * Mutates data.  Clones the container and updates metadata when called on an unmodified transactional reference.
     *
     * Then runs the specified mutator to make the actual changes.
     *
     * @param mutator the mutation logic, may freely modify {@link value}
     */
    change(mutator: () => void): void;

    /**
     * Refresh any internal cache from the referenced container.
     */
    refresh(): void;

    /**
     * The key used for storage of attributes and struct properties.
     */
    primaryKey: "id" | "name";

    /**
     * The managed value that owns the reference.
     */
    owner?: T;

    /**
     * The object that owns the root managed value.
     */
    rootOwner?: any;

    /**
     * The parent of this reference, if any.
     */
    parent?: ValReference;
}
