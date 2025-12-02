/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";
import { Bytes } from "./Bytes.js";
import { isObject } from "./Type.js";

/**
 * Like {@link JSON.stringify} but with support for additional standard objects.
 */
export function asJson(value: unknown, space?: number) {
    return JSON.stringify(
        value,
        (_key, value) => {
            if (typeof value === "bigint") {
                return value.toString();
            }
            if (Bytes.isBytes(value)) {
                return Bytes.toHex(value);
            }
            return value;
        },
        space,
    );
}

/**
 * Create a human readable version of a list of items.
 */
export function describeList(setType: "and" | "or", ...entries: string[]) {
    const text = Array<string>();

    if (entries.length === 1) {
        return entries[0];
    }

    for (let i = 0; i < entries.length; i++) {
        if (i === entries.length - 1) {
            text.push(setType, entries[i]);
        } else if (i === entries.length - 2) {
            text.push(entries[i]);
        } else {
            text.push(`${entries[i]},`);
        }
    }

    return text.join(" ");
}

/**
 * Serialize a structure to JS code that will recreate it.  Supports a limited number of JS types.  Makes no effort at
 * pretty printing.
 */
export function serializeToJs(value: unknown) {
    switch (typeof value) {
        case "bigint":
            return `0x${value.toString(16)}n`;

        case "boolean":
            return `${value}`;

        case "number":
            if (Number.isSafeInteger(value) && value > 10) {
                return `0x${value.toString(16)}`;
            }
            return `${value}`;

        case "string":
            return JSON.stringify(value);

        case "undefined":
            return "undefined";

        case "function":
        case "symbol":
            throw new ImplementationError(`Cannot serialize a ${typeof value}`);
    }

    if (value instanceof Date) {
        return `new Date(${JSON.stringify(value.toISOString)})`;
    }

    if (Bytes.isBytes(value)) {
        return `b$\`${Bytes.toHex(value)}\``;
    }

    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        const parts = ["["];
        for (const item of value) {
            parts.push(serializeToJs(item), ",");
        }
        parts.push("]");
        return parts.join("");
    }

    if (!isObject(value)) {
        throw new ImplementationError(`Cannot serialize a ${(value as any).constructor.name}`);
    }

    const parts = ["{"];
    for (const key in value) {
        parts.push(key, ":", serializeToJs(value[key]), ",");
    }
    parts.push("}");
    return parts.join("");
}

export namespace hex {
    export function fixed(value: number | bigint, width: number) {
        return value.toString(16).padStart(width, "0");
    }

    export function byte(value: number | bigint) {
        return fixed(value, 2);
    }

    export function word(value: number | bigint) {
        return fixed(value, 4);
    }
}
