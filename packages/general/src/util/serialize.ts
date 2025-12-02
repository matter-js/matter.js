/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "./Bytes.js";

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
