/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Merge one or more sets of override fields onto a base object, skipping any override properties whose value is
 * `undefined`.
 *
 * Unlike the spread operator (`{ ...base, ...overrides }`), this preserves the base value for any key that is
 * explicitly set to `undefined` in an override.  Useful when overrides are `Partial<T>` where absent fields should
 * fall back to the base rather than clearing it.
 *
 * Multiple overrides are applied left-to-right.
 */
export function merge<T extends object>(base: T, ...overrides: Array<Partial<T>>): T {
    const result = { ...base } as Record<string, unknown>;
    for (const override of overrides) {
        for (const key of Object.keys(override) as Array<keyof T>) {
            const value = override[key];
            if (value !== undefined) {
                result[key as string] = value;
            }
        }
    }
    return result as T;
}
