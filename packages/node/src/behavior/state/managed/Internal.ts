/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Val } from "@matter/protocol";
import type { ValReference } from "./ValReference.js";

/**
 * API for bypassing managed collections: access to the internal object containing raw data, and raw copies of
 * incoming values.
 */
export namespace Internal {
    export const reference = Symbol("reference");
    export const session = Symbol("session");

    export interface Collection {
        [reference]: ValReference<Val.Collection>;
    }

    /**
     * The raw value behind a managed proxy, or `value` itself.  Unlike {@link copy}, the result is the stored object,
     * so a list entry reference bound to one of its entries stays live when the value is stored back.
     */
    export function rawOf(value: Val): Val {
        if (value === null || value === undefined || typeof value !== "object") {
            return value;
        }
        const ref = (value as Collection)[reference];
        return ref ? ref.value : value;
    }

    /**
     * Copy an incoming value tree into raw data for a manager to store.
     *
     * A managed proxy is replaced by a copy of its raw value, including the entries of other fabrics.  Every array and
     * every plain object is copied, so the stored value shares no array or plain object with the committed state, with
     * another reference or with the caller.  A nested write changes a container in place once the transaction owns it,
     * so a shared container would change in both places.  A copied object keeps its symbol-keyed properties, such as
     * `BitmapEncodedValue`, with the same values.
     *
     * Primitives, Uint8Array, Date and other class instances pass through unchanged.
     */
    export function copy(value: Val): Val {
        if (value === null || value === undefined || typeof value !== "object") {
            return value;
        }

        const ref = (value as Collection)[reference];
        if (ref) {
            return copy(ref.value);
        }

        if (Array.isArray(value)) {
            return value.map(copy);
        }

        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
            return value;
        }

        const source = value as Val.Struct;
        const result: Val.Struct = {};
        for (const key in source) {
            result[key] = copy(source[key]);
        }
        for (const symbol of Object.getOwnPropertySymbols(source)) {
            Object.defineProperty(result, symbol, Object.getOwnPropertyDescriptor(source, symbol)!);
        }
        return result;
    }
}
