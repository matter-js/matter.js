/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Acronym-bearing keys whose camelCase form is not just "lowercase the first
 * letter". Mirrors python-otbr-api's `_PASCAL_TO_CAMEL` table — entries that
 * naive lowercasing would turn into things like `mACCounters` or `iP6...`.
 */
const IRREGULAR: Readonly<Record<string, string>> = {
    BaId: "baId",
    IP6AddressList: "ip6AddressList",
    MACCounters: "macCounters",
    PSKc: "pskc",
};

function normalizeKey(key: string): string {
    const mapped = IRREGULAR[key];
    if (mapped !== undefined) return mapped;
    if (key.length === 0) return key;
    return key.charAt(0).toLowerCase() + key.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object") return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Classify an OTBR REST response object by its key casing: legacy builds emit
 * PascalCase (`NetworkName`), post-2024 builds camelCase (`networkName`). Any
 * uppercase-first key marks the object as pascal; a non-empty object with only
 * lowercase-first keys is camel. An empty object yields `null` — no signal.
 */
export function detectKeyFormat(raw: Record<string, unknown>): "camel" | "pascal" | null {
    let sawKey = false;
    for (const key of Object.keys(raw)) {
        if (key.length === 0) continue;
        sawKey = true;
        const first = key.charCodeAt(0);
        if (first >= 65 && first <= 90) return "pascal";
    }
    return sawKey ? "camel" : null;
}

/**
 * Recursively rewrites object keys from PascalCase (or already-camelCase) to
 * camelCase. Idempotent — running it twice yields identical output. Arrays,
 * primitives and `null` pass through unchanged.
 */
export function normalizeKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(item => normalizeKeys(item));
    }
    if (isPlainObject(value)) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            out[normalizeKey(k)] = normalizeKeys(v);
        }
        return out;
    }
    return value;
}
