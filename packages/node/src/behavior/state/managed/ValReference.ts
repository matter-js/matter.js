/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AccessControl, Val } from "@matter/protocol";
import { ExpiredReferenceError, PhantomReferenceError } from "@matter/protocol";
import type { Supervision } from "../../supervision/Supervision.js";

/**
 * A Reference offers a simple mechanism for referring to properties by reference.
 *
 * This was originally defined as `Val.Reference` in `@matter/protocol` but is only consumed within `@matter/node`.
 */
export interface ValReference<T extends Val = Val> {
    /**
     * The current value of the referenced property.  `undefined` or `null` while the property, or a container above
     * it, is absent.  After the owning context exits, a nested reference keeps the last value it saw and the root
     * reference throws {@link ExpiredReferenceError}.
     */
    readonly value: T | undefined | null;

    /**
     * The current canonical value of the referenced property.
     */
    readonly original: T;

    /**
     * When true, the reference is no longer usable because the owning context has exited.  Final, and true for every
     * reference below an expired one.
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
     * @param member the key of the member of {@link value} the mutation assigns.  The root reference records it as
     * assigned.  A nested reference passes its own key to its parent instead, so the root always records the
     * top-level member
     */
    change(mutator: () => void, member: string | number): void;

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
     *
     * `id` also asserts provenance: only a datasource mirroring a peer keys by element ID, and for such a container
     * the peer's reports are the only source of values — no locally derived value (state-class field initializer,
     * configured default or computed schema default) may enter it or be synthesized on read.
     */
    export type PrimaryKey = "id" | "name";

    /**
     * The container {@link reference} points to, for a manager that reads its members.  A nested reference whose
     * owning context exited still serves the last container it saw.
     *
     * @throws PhantomReferenceError when the property, or a container above it, is absent
     * @throws ExpiredReferenceError when the container is absent and the owning context has exited, or when
     * {@link reference} is a root reference whose owning context has exited
     */
    export function containerOf<T extends Val>(reference: ValReference<T>): NonNullable<T> {
        const container = reference.value;
        if (container === undefined || container === null) {
            if (reference.expired) {
                throw new ExpiredReferenceError(reference.location);
            }
            throw new PhantomReferenceError(reference.location);
        }
        return container;
    }

    /**
     * The container {@link reference} points to, for a manager that writes its members.
     *
     * @throws ExpiredReferenceError when the owning context has exited, whether or not the container is present
     * @throws PhantomReferenceError when the property, or a container above it, is absent
     */
    export function writableContainerOf<T extends Val>(reference: ValReference<T>): NonNullable<T> {
        if (reference.expired) {
            throw new ExpiredReferenceError(reference.location);
        }
        return containerOf(reference);
    }
}
