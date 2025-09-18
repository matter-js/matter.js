/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes as ByteUtils, Duration, serialize as stringSerialize, UnexpectedDataError } from "#general";
import type { Metatype } from "./Metatype.js";

/**
 * A FieldValue represents a concrete value for a datatype.  Most values are primitives but some values we encode with
 * specialized typed objects so we can capture the original semantic meaning.
 */
export type FieldValue =
    | null
    | string
    | number
    | bigint
    | boolean
    | Date
    | Duration
    | FieldValue[]
    | FieldValue.Properties
    | FieldValue.Reference
    | FieldValue.Percent
    | FieldValue.Celsius
    | FieldValue.Bytes
    | FieldValue.None;

/**
 * Create a FieldValue (or undefined) from a naked JavaScript value.
 *
 * Assumes that objects and arrays already contain valid FieldValues.
 */
export function FieldValue(value: unknown): FieldValue | undefined {
    if (typeof value === "function") {
        throw new UnexpectedDataError("Cannot cast function to FieldValue");
    }

    if (typeof value === "object" && value !== null) {
        if (Array.isArray(value)) {
            return value as FieldValue[];
        }

        if (value instanceof Date) {
            return value;
        }

        return value as FieldValue.Properties;
    }

    return value as FieldValue;
}

export namespace FieldValue {
    // Typing with constants should be just as type safe as using an enum but simplifies type definitions

    export const percent = "percent";
    export type percent = typeof percent;

    export const celsius = "celsius";
    export type celsius = typeof celsius;

    export const reference = "reference";
    export type reference = typeof reference;

    export const properties = "properties";
    export type properties = typeof properties;

    export const bytes = "bytes";
    export type bytes = typeof bytes;

    export const none = "none";
    export type none = typeof none;

    /**
     * A field value that allows type extension.
     */
    export type Open = FieldValue | { type: string };

    /**
     * If a field value isn't a primitive type, it's an object with a type field indicating one of these types.
     */
    export type Type = percent | celsius | reference | properties | bytes | none;

    /**
     * Test for one of the special placeholder types.
     */
    export function is(value: Open | undefined, type: Type) {
        return value && (value as any).type === type;
    }

    /**
     * Flag for an invalid value.  Not part of the FieldValue union but returned when casting to a field value if the
     * cast is impossible
     */
    export const Invalid: unique symbol = Symbol("invalid");
    export type Invalid = typeof Invalid;

    /**
     * Flag for an "Undefined"/No value. Can be used in overrides to reset fields
     */
    export type None = {
        type: none;
    };

    export const None: None = {
        type: none,
    };

    /**
     * Reference to a named field
     */
    export type Reference = {
        type: reference;
        name: string;
    };

    export function Reference(name: string): Reference {
        return { type: reference, name };
    }

    /**
     * Celsius value, typically .1°C or .01°C
     */
    export type Celsius = {
        type: celsius;
        value: number;
    };

    export function Celsius(value: number): Celsius {
        return { type: celsius, value };
    }

    /**
     * Percent value, units of either 1% (.01) or .01% (.0001)
     */
    export type Percent = {
        type: percent;
        value: number;
    };

    export function Percent(value: number): Percent {
        return { type: percent, value };
    }

    /**
     * A set of struct property values keyed by name.
     */
    export type Properties = {
        type: properties;
        properties: { [name: string]: FieldValue };
    };

    /**
     * Byte value, encoded as hex string.
     */
    export type Bytes = {
        type: bytes;
        value: string;
    };

    export function Bytes(value: AllowSharedBufferSource | string): Bytes {
        return { type: bytes, value: typeof value === "string" ? value : ByteUtils.toHex(ByteUtils.of(value)) };
    }

    /**
     * Convert the field value to a "defacto-standard" form.
     */
    export function serialize(value: FieldValue): string {
        if (value === null) {
            return "null";
        }
        if (is(value, none)) {
            return "";
        }
        if (is(value, reference)) {
            return (value as Reference).name;
        }
        if (is(value, celsius)) {
            return `${(value as Celsius).value}°C`;
        }
        if (is(value, percent)) {
            return `${(value as Percent).value}%`;
        }
        if (is(value, properties)) {
            return stringSerialize((value as Properties).properties) ?? "?";
        }
        return value.toString();
    }

    /**
     * Given a type name as a hint, do our best to convert a field value to a number.
     */
    export function numericValue(value: Open | undefined, typeName?: string) {
        if (typeof value === "boolean") {
            return value ? 1 : 0;
        }

        if (typeof value === "number") {
            return value;
        }

        if (is(value, celsius)) {
            switch (typeName) {
                case "temperature":
                case "temp-diff":
                    return (value as Celsius).value * 100;

                case "temp-u8":
                case "temp-s8":
                    return (value as Celsius).value * 10;
            }

            // Not sure how to interpret the value
            return;
        }

        if (is(value, percent)) {
            switch (typeName) {
                case "percent100ths":
                    return (value as Percent).value * 100;

                default:
                    return (value as Percent).value;
            }
        }
    }

    /**
     * Extract object properties from the value.
     */
    export function objectValue(value: FieldValue | undefined) {
        if (is(value, properties)) {
            return (value as Properties).properties;
        }
    }

    /**
     * Unwrap wrapped values, leave others as-is.
     */
    export function unwrap(value: FieldValue | undefined, typeName?: string) {
        if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
            return value;
        }

        const type = value.type;
        switch (type) {
            case "properties":
                return objectValue(value);

            case "reference":
                // This needs to be handled at a higher level
                return;

            case "none":
                return; // undefined

            case "percent":
            case "celsius":
                return numericValue(value, typeName);

            case undefined:
                throw new UnexpectedDataError(`Field value objects must be wrappers with "type" field`);

            default:
                throw new UnexpectedDataError(`Unsupported wrapped object type "${type}"`);
        }
    }

    /**
     * Get the referenced name if the FieldValue is a reference.
     */
    export function referenced(value: Open | undefined) {
        if (is(value, reference)) {
            return (value as Reference).name;
        }
    }

    /**
     * Convert an arbitrary value to a proper FieldValue.
     *
     * @param type casts to a native equivalent of this type
     * @param value value to cast
     *
     * @returns the cast value or FieldValue.Invalid if cast is not possible
     */
    export function cast<const T extends Metatype>(type: T, value: any): FieldValue | FieldValue.Invalid | undefined {
        if (value === undefined || value === null || type === "any") {
            return value;
        }

        if (value === "null") {
            return null;
        }

        if (value === "") {
            if (type === "string") {
                return "";
            }
            return undefined;
        }

        if (FieldValue.is(value, FieldValue.reference)) {
            return value;
        }

        switch (type) {
            case "string":
                return value.toString();

            case "boolean":
                if (typeof value === "string") {
                    value = value.trim().toLowerCase();
                }
                return value !== "false" && value !== "no" && !!value;

            case "bitmap":
            case "enum":
                if (FieldValue.is(value, FieldValue.properties) && type === "bitmap") {
                    return value;
                }

                const id = Number(value);
                if (!Number.isFinite(id)) {
                    if (typeof value === "string") {
                        // Key name
                        return value;
                    }
                    return;
                }

                // Value
                return id;

            case "integer":
                if (typeof value === "string") {
                    // Specialized support for percentages and temperatures
                    let type: FieldValue.celsius | FieldValue.percent | undefined;
                    if (value.endsWith("°C")) {
                        type = FieldValue.celsius;
                    } else if (value.endsWith("%")) {
                        type = FieldValue.percent;
                    }
                    if (type) {
                        value = Number.parseInt(value);
                        if (!Number.isFinite(value)) {
                            return FieldValue.Invalid;
                        }
                        return { type, value };
                    }

                    // Strip off extra garbage like Number.parseInt would but BigInt doesn't
                    const match = value.match(/^(0x[0-9a-f]+|0b[01]+|\d+)/i);
                    if (match) {
                        value = match[1];
                    }
                }

                try {
                    switch (typeof value) {
                        case "string":
                        case "number":
                        case "bigint":
                        case "boolean":
                            break;

                        default:
                            if (FieldValue.is(value, FieldValue.celsius) || FieldValue.is(value, FieldValue.percent)) {
                                return value;
                            }
                            return FieldValue.Invalid;
                    }
                    const i = BigInt(value);
                    const n = Number(i);
                    if (BigInt(n) === i) {
                        return n;
                    }
                    return i;
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        return FieldValue.Invalid;
                    }
                    throw e;
                }

            case "float":
                const float = Number(value);
                if (!Number.isFinite(float)) {
                    return FieldValue.Invalid;
                }
                return float.valueOf();

            case "date":
                if (value instanceof Date) {
                    return value;
                }
                if (typeof value !== "string") {
                    return FieldValue.Invalid;
                }
                value = new Date(value);
                if (!Number.isFinite(value.valueOf())) {
                    return FieldValue.Invalid;
                }
                return value;

            case "object":
                if (FieldValue.is(value, FieldValue.properties)) {
                    return value;
                }
                break;

            case "bytes":
                if (value === "empty") {
                    return undefined;
                }
                if (FieldValue.is(value, FieldValue.bytes)) {
                    return value;
                }
                if (typeof value === "string" || ByteUtils.isBytes(value)) {
                    return Bytes(value);
                }
                break;

            case "array":
                // Eject garbage we've seen in the spec
                if (value === "0" || value === "{0,0}") {
                    return;
                }
                if (value === "empty" || value === "[]" || value === "{}") {
                    return [];
                }
                if (Array.isArray(value)) {
                    return value;
                }

                // The only supported literal is an empty array
                return FieldValue.Invalid;
        }

        return FieldValue.Invalid;
    }
}
