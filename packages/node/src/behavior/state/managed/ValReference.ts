/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AccessControl, Val } from "@matter/protocol";
import { ExpiredReferenceError, PhantomReferenceError } from "@matter/protocol";
import type { Supervision } from "../../supervision/Supervision.js";
import { Internal } from "./Internal.js";

/**
 * A Reference offers a simple mechanism for referring to properties by reference.
 *
 * This was originally defined as `Val.Reference` in `@matter/protocol` but is only consumed within `@matter/node`.
 */
export interface ValReference<T extends Val = Val> {
    /**
     * The current value of the referenced property.  While the property is absent, a reference with a default for it
     * serves that default, and any other reference serves `undefined` or `null`.  A reference below a container that
     * is absent without a default serves `undefined` or `null` too.  An expired nested reference keeps the last
     * container it saw, which a live reference to the same entry may still change.  The root reference throws
     * {@link ExpiredReferenceError} after its owning context exits.
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
     * Throw the error a change through this reference fails with.  Does not check whether the member is absent;
     * {@link ValReference.containerOf} does.  A change asks before it is applied and before it joins the transaction.
     * The access check, list bounds checks and the validation of a new list entry run before this; validation of a
     * value assigned to a struct member runs after it.  The Remote API `add` asks before the access check.
     *
     * Checks in this order, so the first refusal wins: {@link expired}, then the datasource, then a default served by
     * this reference or one above it.
     *
     * @throws ExpiredReferenceError when the reference is {@link expired}, naming the location of this reference
     * @throws what the datasource's `ExternallyMutableStore.assertWritable` throws
     * @throws UncachedValueError when this reference, or one above it, serves the default of an absent member
     */
    assertWritable(): void;

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
     * Whether the root datasource holds a copy of a remote node's values.
     */
    readonly mirrorsRemote: boolean;

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
     * `id` also asserts provenance: only a datasource mirroring a peer keys by element ID, and such a container stores
     * only values the peer reported or that are being written to it — no locally derived value (state-class field
     * initializer, configured default or computed schema default) may enter it.  A mandatory member the container
     * does not hold reads as its default, which is never stored; see `ManagedReference`.
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
     * @throws any error {@link ValReference.assertWritable} throws
     */
    export function writableContainerOf<T extends Val>(reference: ValReference<T>): NonNullable<T> {
        reference.assertWritable();
        return containerOf(reference);
    }

    /**
     * Assert that {@link value} may be changed.  Use it before a value built from {@link value}, such as a list with
     * one more entry, replaces it: {@link value} may be a default that the datasource does not hold, and the new value
     * would then replace the remote value.  Returns for a value that is not managed.
     *
     * @throws any error {@link ValReference.assertWritable} throws for the reference behind {@link value}
     */
    export function assertWritableValue(value: Val) {
        Internal.referenceOf(value)?.assertWritable();
    }
}
