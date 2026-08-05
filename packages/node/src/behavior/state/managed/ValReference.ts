/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AccessControl, Val } from "@matter/protocol";
import type { Supervision } from "../../supervision/Supervision.js";

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
     * How this container keys its own members.  Only a datasource root may key by element ID; every nested container
     * keys by property name (list entries, by index).
     */
    readonly primaryKey: ValReference.PrimaryKey;

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

    /**
     * Per-instance validation configuration for this reference.
     */
    supervisionConfig?: Supervision.Config;
}

export namespace ValReference {
    /**
     * How a container keys its own members.
     */
    export type PrimaryKey = "id" | "name";

    /**
     * The slot a member occupies in a container keyed by {@link ValReference.primaryKey}.
     *
     * The persisted key set ({@link RootSupervisor.persistentKeys}) and a datasource container's own keys must both
     * derive from this function — if they diverge, attributes silently stop persisting.
     */
    export function keyFor(primaryKey: PrimaryKey, name: string | number, id: number | undefined): string | number {
        return primaryKey === "id" ? (id ?? name) : name;
    }

    /**
     * The key under the other keying convention, if distinct from {@link ValReference.keyFor}'s — whether a reader
     * may fall back to it is the reader's policy.
     */
    export function altKeyFor(
        primaryKey: PrimaryKey,
        name: string | number,
        id: number | undefined,
    ): string | number | undefined {
        const key = keyFor(primaryKey, name, id);
        return primaryKey === "id" ? (key === name ? undefined : name) : id;
    }

    /**
     * Read a member from container at key, falling back to altKey; a caller passes `undefined` for altKey when it
     * must not tolerate the alternate slot.
     */
    export function memberValueOf(
        container: Val.Struct,
        key: string | number,
        altKey: string | number | undefined,
    ): Val | undefined {
        if (key in container) {
            return container[key];
        }

        if (altKey !== undefined && altKey in container) {
            return container[altKey];
        }

        return undefined;
    }
}
