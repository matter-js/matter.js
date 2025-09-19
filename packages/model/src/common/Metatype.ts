/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Duration, isObject, UnexpectedDataError } from "#general";

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
     * Determine the JS type for a metatype.
     */
    export function native(type: Metatype | undefined) {
        switch (type) {
            case Metatype.boolean:
                return Boolean;

            case Metatype.integer:
                return BigInt;

            case Metatype.bitmap:
            case Metatype.enum:
            case Metatype.float:
                return Number;

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
                      : never;

    /**
     * Functions that perform conversion of arbitrary values to a metatype.
     *
     * This is a "best effort" that ensures the value is an appropriate JS type but cannot ensure semantic validity in
     * all cases.
     *
     * @throws {@link UnsupportedCastError} if the cast is deemed impossible
     */
    export function cast<const T extends `${Metatype}`>(type: T, value: unknown) {
        const caster = cast[type];
        return caster(value) as Native<T>;
    }

    cast.any = (value: unknown) => value;

    cast.boolean = (value: unknown): boolean | null | undefined => {
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
    };

    cast.bitmap = (value: any): number | bigint | Record<string, number> | null | undefined => {
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
    };

    cast.enum = (value: any): number | string | null | undefined => {
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
    };

    cast.integer = (value: any): number | bigint | null | undefined => {
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
                if (big === BigInt(little)) {
                    return little;
                }
                return big;
            } catch (e) {
                if (!(e instanceof SyntaxError)) {
                    throw e;
                }
            }
        }

        throw new UnsupportedCastError(`Cannot convert "${value}" to an integer`);
    };

    cast.float = (value: any): number | null | undefined => {
        if (typeof value === "number" || value === null || value === undefined) {
            return value;
        }

        if (value instanceof Date) {
            return value.getTime();
        }

        const number = Number(value);
        if (Number.isFinite(value)) {
            return number;
        }

        throw new UnsupportedCastError(`Cannot convert "${value}" to a float`);
    };

    cast.bytes = (value: any): Bytes | null | undefined => {
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
    };

    cast.array = (value: any): Array<unknown> | null | undefined => {
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
    };

    cast.object = (value: any): Record<string, unknown> | null | undefined => {
        if (value === undefined || (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date))) {
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
    };

    cast.string = (value: any): string | null | undefined => {
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
    };

    cast.date = (value: any): Date | null | undefined => {
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
    };

    cast.duration = (value: any): Duration | null | undefined => {
        if (value === undefined || value === null) {
            return value;
        }

        return Duration(value);
    };

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
