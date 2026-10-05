/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { serialize as serializeForLog } from "#general";

export { camelize, describeList } from "#general";

/**
 * Serialize a value as TypeScript source.
 *
 * The general serializer also formats log output, where a bigint prints without its suffix.  In source that literal
 * reads back as a number, which rounds any magnitude beyond 2^53, so here a bigint keeps its "n".
 */
export function serialize(value: unknown) {
    return serializeForLog(withBigintLiterals(value));
}

export namespace serialize {
    export const asIs = serializeForLog.asIs;
    export const isPrimitive = serializeForLog.isPrimitive;
}

function withBigintLiterals(value: unknown): unknown {
    if (typeof value === "bigint") {
        return serializeForLog.asIs(`${value}n`);
    }

    if (Array.isArray(value)) {
        return value.map(withBigintLiterals);
    }

    if (typeof value === "object" && value !== null) {
        const prototype = Object.getPrototypeOf(value);
        if (prototype === Object.prototype || prototype === null) {
            return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, withBigintLiterals(entry)]));
        }
    }

    return value;
}

/**
 * Returns a string formatted to function as an object key.  This means escaping as a string if it can't be a bare
 * identifier.
 */
export function asObjectKey(label: any) {
    let str = `${label}`;
    if (!str.match(/^[$_a-z][$\w]*$/i)) {
        str = JSON.stringify(label);
    }
    return str;
}
