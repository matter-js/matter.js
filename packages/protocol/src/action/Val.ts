/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControl } from "./server/AccessControl.js";

/**
 * Any JS value representing a value defined by Matter.
 */
export type Val = unknown;

export namespace Val {
    /**
     * Type for Matter structs.  In JS this is an object with string keys.
     */
    export type Struct = Record<string, Val>;

    /**
     * Type for Matter structs encoded using protocol semantics.  In JS this is an object with "numeric" keys.
     */
    export type ProtocolStruct = Record<number, Val>;

    /**
     * Type for Matter lists.  In Js this is an array.
     */
    export type List = Val[];

    /**
     * Any matter collection type.
     */
    export type Collection = Struct | List;

    /**
     * A readonly version of {@link Collection}.
     */
    export type ReadonlyCollection = { readonly [K: string | number]: Val } | ReadonlyArray<unknown>;

    /**
     * A Reference offers a simple mechanism for referring to properties by reference.
     */
    export interface Reference<T extends Val = Val> {
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
        subrefs?: Record<number | string, Reference>;

        /**
         * Mutates data.  Clones the container and updates metadata when called on an unmodified transactional
         * reference.
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
        parent?: Reference;
    }

    export const properties = Symbol("properties");

    /**
     * Unmanaged raw state classes have no contextual information.  They may implement this interface to provide an
     * alternate context-aware object for property read, write and validation.
     */
    export interface Dynamic<O = any, S extends AccessControl.Session = AccessControl.Session> extends Struct {
        /**
         * Obtain a context-aware property source (and sink).  Supervision will read/write properties from here if
         * present.  Otherwise they're read from static state as normal.
         *
         * @param owner the owner of the root reference of the managed value
         * @param session the {@link AccessControl.Session} accessing the value
         */
        [properties]<This extends Val.Struct>(this: This, owner: O, session: S): Partial<This>;
    }
}
