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
     * An ordered map representation of {@link Struct} that preserves insertion order of keys.
     *
     * Used when attribute-change ordering must be maintained across the processing pipeline.
     */
    export type StructMap = Map<string | number, Val>;

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
