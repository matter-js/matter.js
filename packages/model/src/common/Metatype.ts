/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Duration, isObject, UnexpectedDataError } from "@matter/general";

export class UnsupportedCastError extends UnexpectedDataError {}

/**
 * General groupings of Matter types.
 */
export enum Metatype {
    any = "any",
    boolean = "boolean",
    bitmap = "bitmap",
    enum = "enum",
    integer = "integer",
    float = "float",
    bytes = "bytes",
    array = "array",
    object = "object",
    string = "string",
    date = "date",
    duration = "duration",
}

/**
 * The bound of a metatype no case states.
 *
 * The parameter is {@link never}, so a metatype added to the enum without a bound is a compile error.  A value
 * reaching here at runtime came from a cast — an element definition states its metatype as a string — and states no
 * bound rather than failing, as every other classification of a metatype does.
 */
function unclassified(_type: never) {
    return undefined;
}

export namespace Metatype {
    /**
     * Does the specific type have children?
     */
    export function hasChildren(type: Metatype | undefined) {
        switch (type) {
            case Metatype.enum:
            case Metatype.bitmap:
            case Metatype.object:
                return true;

            default:
                return false;
        }
    }

    /**
     * What a constraint on a value of a metatype states.
     *
     * @see {@link MatterSpecification.v16.Core} § 7.19.2
     */
    export enum BoundKind {
        /** A range or exact value the number the value encodes to must fall in */
        magnitude = "magnitude",

        /** A range or exact count of the elements the value holds */
        length = "length",

        /** The one value it may take */
        value = "value",

        /** Nothing: the type has neither a magnitude nor a length, so a bound on it states no bound at all */
        none = "none",
    }

    /**
     * What a constraint on a value of this metatype states, or undefined where the type is unknown and so states
     * nothing either way.
     *
     * This is what the specification may say about the value, which is not the same as what a comparison can check:
     * a bitmap and a date both take a bound the specification states, such as the "max 15" of a window covering's
     * mode, while neither is held as a number a bound compares against.  {@link holdsNumber} answers that.
     *
     * @see {@link MatterSpecification.v16.Core} § 7.19.2
     */
    export function boundKind(type: Metatype | undefined) {
        switch (type) {
            case Metatype.integer:
            case Metatype.float:
            case Metatype.enum:
            case Metatype.bitmap:
            case Metatype.duration:
            case Metatype.date:
                return BoundKind.magnitude;

            case Metatype.string:
            case Metatype.bytes:
            case Metatype.array:
                return BoundKind.length;

            case Metatype.boolean:
                return BoundKind.value;

            case Metatype.object:
            case Metatype.any:
                return BoundKind.none;

            case undefined:
                return undefined;

            default:
                // Every metatype states what a bound on it means, so a new one is a compile error here rather than a
                // value silently treated as of unknown type
                return unclassified(type);
        }
    }

    /**
     * Whether a value of this metatype is held as a number, so a comparison against one has a numeric meaning.
     *
     * A bitmap encodes to a number but is held as the record of its flags, as {@link native} states, so a bound
     * comparing against one compares
     * a number against a record, which is false whatever the value.  A date is held as a {@link Date}, which a
     * comparison coerces to a timestamp — a number of a different scale from anything a constraint states, so a bound
     * naming one states no bound worth judging.  A duration is held as a number of milliseconds.
     */
    export function holdsNumber(type: Metatype | undefined) {
        switch (type) {
            case Metatype.integer:
            case Metatype.float:
            case Metatype.enum:
            case Metatype.duration:
                return true;

            default:
                return false;
        }
    }

    /**
     * Whether a value of this metatype is held as a record, so a member access may take a member of one.
     *
     * This is not the same as defining members: an enumerated type defines its values, but a value of one is held as
     * the number it encodes to, so an access takes nothing from it.
     */
    export function holdsRecord(type: Metatype | undefined) {
        switch (type) {
            case Metatype.object:
            case Metatype.bitmap:
                return true;

            default:
                return false;
        }
    }

    /**
     * Determine the JS type for a metatype.
     */
    export function native(type: Metatype | undefined) {
        switch (type) {
            case Metatype.boolean:
                return Boolean;

            case Metatype.integer:
                return BigInt;

            case Metatype.enum:
            case Metatype.float:
                return Number;

            // A bitmap encodes to a number but is held as the record of its flags, as {@link holdsRecord} states
            case Metatype.bitmap:
                return Object;

            case Metatype.bytes:
                return Uint8Array;

            case Metatype.array:
                return Array;

            case Metatype.object:
                return Object;

            case Metatype.string:
                return String;

            case Metatype.date:
                return Date;

            case Metatype.duration:
                return Duration;
        }
    }

    /**
     * Map metatype value to JS type.
     */
    export type Native<T> = T extends "boolean"
        ? boolean
        : T extends "integer" | "float"
          ? number
          : T extends "string"
            ? string
            : T extends "bitmap" | "object"
              ? Record<string, unknown>
              : T extends "array"
                ? unknown[]
                : T extends "bytes"
                  ? Uint8Array
                  : T extends "date"
                    ? Date
                    : T extends "any"
                      ? unknown
                      : T extends "duration"
                        ? number
                        : never;

    /**
     * Shape of {@link cast}: a generic call signature for dispatch + per-metatype converters.
     */
    interface Cast {
        <const T extends `${Metatype}`>(type: T, value: unknown): Native<T>;
        any: (value: unknown) => unknown;
        boolean: (value: unknown) => boolean | null | undefined;
        bitmap: (value: any) => number | bigint | Record<string, number> | null | undefined;
        enum: (value: any) => number | string | null | undefined;
        integer: (value: any) => number | bigint | null | undefined;
        float: (value: any) => number | null | undefined;
        bytes: (value: any) => Bytes | null | undefined;
        array: (value: any) => Array<unknown> | null | undefined;
        object: (value: any) => Record<string, unknown> | null | undefined;
        string: (value: any) => string | null | undefined;
        date: (value: any) => Date | null | undefined;
        duration: (value: any) => Duration | null | undefined;
    }

    function castFn<const T extends `${Metatype}`>(type: T, value: unknown): Native<T> {
        const caster = cast[type as Exclude<keyof Cast, never>];
        return caster(value) as Native<T>;
    }

    /**
     * Functions that perform conversion of arbitrary values to a metatype.
     *
     * This is a "best effort" that ensures the value is an appropriate JS type but cannot ensure semantic validity in
     * all cases.
     *
     * @throws {@link UnsupportedCastError} if the cast is deemed impossible
     */
    export const cast: Cast = Object.assign(castFn, {
        any: (value: unknown) => value,

        boolean: (value: unknown): boolean | null | undefined => {
            if (typeof value === "boolean" || value === null || value === undefined) {
                return value;
            }

            if (typeof value === "string") {
                const normalized = value.toLowerCase().trim();
                switch (normalized) {
                    case "":
                    case "0":
                    case "off":
                    case "no":
                    case "false":
                        return false;

                    case "1":
                    case "on":
                    case "yes":
                    case "true":
                        return true;
                }
            }

            if (typeof value === "number" || typeof value === "bigint") {
                return !!value;
            }

            if (ArrayBuffer.isView(value)) {
                for (const byte of new Uint8Array(value.buffer)) {
                    if (byte) {
                        return true;
                    }
                }
                return false;
            }

            throw new UnsupportedCastError(`Cannot convert "${value}" to boolean`);
        },

        bitmap: (value: any): number | bigint | Record<string, number> | null | undefined => {
            if (value === null || value === undefined) {
                return value;
            }

            if (typeof value === "string") {
                value = cast.integer(value);
            }

            if (typeof value === "number") {
                if (Number.isFinite(value)) {
                    return value;
                }
            } else if (typeof value === "bigint") {
                return value;
            } else if (isObject(value)) {
                return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cast.integer(v)])) as Record<
                    string,
                    number
                >;
            }

            throw new UnsupportedCastError(`Cannot convert "${value}" to bitmap`);
        },

        enum: (value: any): number | string | null | undefined => {
            if (typeof value === "string") {
                if (value.trim().match(/^(?:\d+|0x[0-9a-f]+|0b[01]+)$/)) {
                    value = Number.parseInt(value);
                } else {
                    return value;
                }
            }

            if (typeof value === "number" && Number.isFinite(value)) {
                return value;
            }

            throw new UnsupportedCastError(`Cannot convert "${value}" to an enum value`);
        },

        integer: (value: any): number | bigint | null | undefined => {
            if (value === null || value === undefined) {
                return value;
            }

            switch (typeof value) {
                case "number":
                    return Math.floor(value);

                case "bigint":
                    return value;

                case "boolean":
                    return value ? 1 : 0;
            }

            if (value instanceof Date) {
                return value.getTime();
            }

            if (typeof value === "string") {
                try {
                    const big = BigInt(value);
                    const little = Number.parseInt(value);

                    // Text stating no digits at all, which BigInt reads as zero
                    if (!Number.isNaN(little)) {
                        // A magnitude beyond the integers a number states exactly stays a bigint, since parseInt
                        // states it as Infinity and that is no integer to compare against
                        if (Number.isSafeInteger(little) && big === BigInt(little)) {
                            return little;
                        }
                        return big;
                    }
                } catch (e) {
                    // BigInt refuses text stating no integer with a SyntaxError and a value it cannot hold with a
                    // RangeError, and neither is an integer this can state
                    if (!(e instanceof SyntaxError) && !(e instanceof RangeError)) {
                        throw e;
                    }
                }
            }

            throw new UnsupportedCastError(`Cannot convert "${value}" to an integer`);
        },

        float: (value: any): number | null | undefined => {
            if (typeof value === "number" || value === null || value === undefined) {
                return value;
            }

            if (value instanceof Date) {
                return value.getTime();
            }

            // Only text states a number here; a boolean or an empty array is not a value of this type, whatever
            // Number() makes of it
            if (typeof value === "string" && value.trim() !== "") {
                const number = Number(value);
                if (Number.isFinite(number)) {
                    return number;
                }
            }

            throw new UnsupportedCastError(`Cannot convert "${value}" to a float`);
        },

        bytes: (value: any): Bytes | null | undefined => {
            if (value === undefined || value === null || Bytes.isBytes(value)) {
                return value;
            }

            if (typeof value === "string") {
                return Bytes.fromHex(value);
            }

            if (typeof value === "boolean") {
                return new Uint8Array([value ? 1 : 0]);
            }

            if (typeof value === "number" || typeof value === "bigint") {
                return Bytes.fromHex(value.toString(16));
            }

            throw new UnsupportedCastError(`Cannot convert "${value}" to bytes`);
        },

        array: (value: any): Array<unknown> | null | undefined => {
            if (value === undefined || value === null || Array.isArray(value)) {
                return value;
            }

            if (typeof value === "string") {
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                        return parsed;
                    }
                } catch (e) {
                    if (!(e instanceof SyntaxError)) {
                        throw e;
                    }
                }
            }

            throw new UnsupportedCastError(`Cannot convert "${value}" to array`);
        },

        object: (value: any): Record<string, unknown> | null | undefined => {
            if (
                value === undefined ||
                (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date))
            ) {
                return value;
            }

            if (typeof value === "string") {
                try {
                    const parsed = JSON.parse(value);
                    return parsed;
                } catch (e) {
                    if (!(e instanceof SyntaxError)) {
                        throw e;
                    }
                }
            }

            throw new UnsupportedCastError(`Cannot convert "${value}" to object`);
        },

        string: (value: any): string | null | undefined => {
            if (value === undefined || value === null) {
                return value;
            }

            if (typeof value === "string") {
                return value;
            }

            if (value instanceof Date) {
                return value.toISOString();
            }

            if (typeof value === "object" || Array.isArray(value)) {
                return JSON.stringify(value);
            }

            return value.toString();
        },

        date: (value: any): Date | null | undefined => {
            if (value === undefined || value === null || value instanceof Date) {
                return value;
            }

            if (typeof value === "number" || typeof value === "string") {
                const date = new Date(value);
                if (Number.isFinite(date.getTime())) {
                    return date;
                }
            }

            throw new UnexpectedDataError("Invalid date value");
        },

        duration: (value: any): Duration | null | undefined => {
            if (value === undefined || value === null) {
                return value;
            }

            return Duration(value);
        },
    });

    /**
     * These are the native types used by this module.
     */
    export type NativeType =
        | typeof Boolean
        | typeof BigInt
        | typeof Number
        | typeof Bytes
        | typeof Array
        | typeof Object
        | typeof String
        | typeof Date;
}
