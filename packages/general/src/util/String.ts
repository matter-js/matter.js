/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";
import { Bytes } from "./Bytes.js";
import { isObject } from "./Type.js";

export function capitalize<T extends string>(text: T) {
    return (text[0].toUpperCase() + text.slice(1)) as Capitalize<T>;
}

/**
 * Converts identifiers of the form "foo-bar", "foo_bar", "foo bar", "foo*bar",
 * "fooBar" or "FOOBar" into "fooBar" or "FooBar".
 */
export function camelize(name: string, upperFirst = false) {
    const pieces = new Array<string>();
    let pieceStart = 0,
        sawUpper = false,
        sawLower = false,
        i = 0;

    function addPiece(to: number) {
        if (pieceStart < to) pieces.push(name.slice(pieceStart, to));
        sawLower = sawUpper = false;
    }

    for (; i < name.length; i++) {
        if (name[i] >= "A" && name[i] <= "Z") {
            if (sawLower) {
                addPiece(i);
                pieceStart = i;
            }
            sawUpper = true;
            continue;
        }

        if (name[i] >= "a" && name[i] <= "z") {
            if (!sawLower) {
                if (sawUpper) {
                    addPiece(i - 1);
                    pieceStart = i - 1;
                }
            }
            sawLower = true;
            continue;
        }

        addPiece(i);

        if ((name[i] >= "0" && name[i] <= "9") || name[i] === "$") {
            pieces.push(name[i]);
        }

        pieceStart = i + 1;
        continue;
    }
    addPiece(i);

    let didFirst = false;
    let result = pieces
        .map(piece => {
            let firstChar = piece[0];
            if (upperFirst || didFirst) {
                firstChar = firstChar.toUpperCase();
            } else {
                firstChar = firstChar.toLowerCase();
                didFirst = true;
            }
            return `${firstChar}${piece.slice(1).toLowerCase()}`;
        })
        .join("");

    // Special case so "100ths" doesn't become "100Ths" which is formally correct but goofy
    result = result.replace(/(\d)Ths/i, "$1ths");

    return result;
}

/**
 * Converts an identifier from CamelCase to snake_case.
 */
export function decamelize(name: string, separator = "-") {
    const result = Array<string>();
    let needSeparator = false;
    for (const c of name) {
        if (c >= "A" && c <= "Z") {
            if (needSeparator) {
                result.push(separator);
                needSeparator = false;
            }
            result.push(c.toLowerCase());
        } else {
            result.push(c);
            needSeparator = true;
        }
    }
    return result.join("");
}

/**
 * Like JSON.stringify but targets well-formed JS and is slightly more readable.
 */
export function serialize(value: unknown) {
    const visited = new Set();

    function asValidKey(key: string) {
        if (key.match(/[a-z_$][\w$]*/i)) {
            return key;
        }
        return JSON.stringify(key);
    }

    function serializeOne(value: unknown): string | undefined {
        if (value === undefined) {
            return;
        }
        if (value === null) {
            return "null";
        }
        if ((value as { [serialize.SERIALIZE](): string })[serialize.SERIALIZE]) {
            return (value as { [serialize.SERIALIZE](): string })[serialize.SERIALIZE]();
        }
        if (typeof value === "function") {
            return;
        }
        if (typeof value === "bigint" || value instanceof BigInt) {
            return value.toString();
        }
        if (typeof value === "number" || value instanceof Number) {
            return value.toString();
        }
        if (typeof value === "string" || value instanceof String) {
            return JSON.stringify(value);
        }
        if (typeof value === "boolean") {
            return value ? "true" : "false";
        }
        if (Bytes.isBytes(value)) {
            return Bytes.toHex(value);
        }

        // Composite objects after this
        if (visited.has(value)) {
            return;
        }
        if ((value as { toJSON(): string }).toJSON) {
            value = JSON.parse(JSON.stringify(value));
        }

        try {
            visited.add(value);

            if (Array.isArray(value)) {
                if (value.length) {
                    return `[ ${value.map(serializeOne).join(", ")} ]`;
                }
                return "[]";
            }

            const entries = Object.entries(value as {})
                .map(([k, v]) => [k, serializeOne(v)])
                .filter(([_k, v]) => v !== undefined)
                .map(([k, v]) => `${asValidKey(k ?? "")}: ${v}`);

            if (!entries.length) {
                return "{}";
            }

            return `{ ${entries.join(", ")} }`;
        } finally {
            visited.delete(value);
        }
    }

    return serializeOne(value);
}

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

export namespace serialize {
    /**
     * Custom serialization function key.
     */
    export const SERIALIZE = Symbol("SERIALIZE");

    /**
     * Mark a value as serialized so the serializer just uses its string
     * representation.
     */
    export function asIs(value: any) {
        if (typeof value === "string") {
            value = new String(value);
        }
        if (value !== undefined && value !== null) {
            value[SERIALIZE] = function () {
                return this.toString();
            };
        }
        return value;
    }

    /**
     * Test whether a value serializes as a structure or a primitive.
     */
    export function isPrimitive(value: any) {
        if (
            value === undefined ||
            value === null ||
            value instanceof Date ||
            ArrayBuffer.isView(value) ||
            value[SERIALIZE]
        ) {
            return true;
        }

        if (Array.isArray(value)) {
            return false;
        }

        return typeof value !== "object";
    }
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
