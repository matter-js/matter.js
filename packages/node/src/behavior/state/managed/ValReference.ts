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
     * it, is absent.  An expired nested reference keeps the last container it saw, which a live reference to the same
     * entry may still change.  The root reference throws {@link ExpiredReferenceError} after its owning context exits.
     */
    readonly value: T | undefined | null;

    /**
     * When true, the reference no longer tracks live state: the owning context has exited, a change in this session
     * moved, removed or replaced the list entry it was read for, or the reference is a read-only view.  Final, and true
     * for every reference below an expired one.
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
     * Mutates data.  A nested reference first clones its container unless the transaction {@link owns} it.
     *
     * Then runs the specified mutator to make the actual changes.  A nested reference then stores the changed
     * container in its parent, so the mutator changes state only through this reference or references below it.
     *
     * @param mutator the mutation logic, may freely modify {@link value}
     * @param member the key of the member of {@link value} the mutation assigns.  The root reference records it as
     * assigned.  A nested reference passes its own key to its parent instead, so the root always records the
     * top-level member
     */
    change(mutator: () => void, member: string | number): void;

    /**
     * Refresh any internal cache from the referenced container.
     *
     * @param cause what changed the container, which decides whether a list entry reference follows its index (see
     * `ManagedReference.Binding`)
     */
    refresh(cause: ValReference.RefreshCause): void;

    /**
     * Whether the transaction cloned {@link container} since its last commit or rollback.  A nested write may change
     * an owned container in place; any other container may be shared with committed state.
     */
    owns(container: Val): boolean;

    /**
     * Record {@link container}, a clone this transaction made, as owned until the transaction commits or rolls back.
     */
    adopt(container: Val): void;

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
     * What changed a container before a refresh.
     *
     * - `session`: a change or rollback in the session that holds the reference.
     * - `external`: another transaction committed, and the session has not written since.
     */
    export type RefreshCause = "session" | "external";

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
     * @throws ExpiredReferenceError when the container is absent and the reference is expired, or when
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
     * @throws ExpiredReferenceError when the reference is {@link ValReference.expired}, whether or not the container is
     * present
     * @throws PhantomReferenceError when the property, or a container above it, is absent
     */
    export function writableContainerOf<T extends Val>(reference: ValReference<T>): NonNullable<T> {
        if (reference.expired) {
            throw new ExpiredReferenceError(reference.location);
        }
        return containerOf(reference);
    }
}
