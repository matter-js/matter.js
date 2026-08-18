/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";

/** Define a schema to encode / decode convert type T to type E. */
export abstract class Schema<T, E = Bytes> {
    /** Encodes the value using the schema. */
    encode(value: T): E {
        this.validate(value);
        return this.encodeInternal(value);
    }

    /** Decodes the encoded data using the schema. */
    decode(encoded: E, validate = true): T {
        const result = this.decodeInternal(encoded);
        if (validate) {
            this.validate(result);
            this.validateDecoded(result);
        }
        return result;
    }

    protected abstract encodeInternal(value: T): E;
    protected abstract decodeInternal(encoded: E): T;

    /** Optional validator that can be used to enforce constraints on the data before encoding / after decoding. */
    validate(_value: T): void {
        // Do nothing by default
    }

    /**
     * Optional validator for constraints that apply to a value read but not to one written — a rule the
     * schema enforces on input while still accepting the wider range a caller may legitimately encode.
     */
    protected validateDecoded(_value: T): void {
        // Do nothing by default
    }
}

export type SchemaType<S> = S extends Schema<infer T, any> ? T : never;
export type SchemaEncodedType<S> = S extends Schema<any, infer E> ? E : never;
