/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export const UINT8_MAX = 0xff;
export const UINT16_MAX = 0xffff;
export const UINT24_MAX = 0xffffff;
export const UINT32_MAX = 0xffffffff;
export const UINT64_MAX = BigInt("18446744073709551615");

export const INT8_MIN = -128;
export const INT16_MIN = -32768;
export const INT32_MIN = -2147483648;
export const INT64_MIN = BigInt("-9223372036854775808");
export const INT8_MAX = 127;
export const INT16_MAX = 32767;
export const INT32_MAX = 2147483647;
export const INT64_MAX = BigInt("9223372036854775807");

export const FLOAT32_MIN = -340282346638528859811704183484516925440.0;
export const FLOAT32_MAX = 340282346638528859811704183484516925440.0;
export const FLOAT64_MIN = -Number.MAX_VALUE;
export const FLOAT64_MAX = Number.MAX_VALUE;

export function toNumber(value: bigint | number): number {
    return typeof value === "bigint" ? Number(value) : value;
}

export function minValue<T extends bigint | number>(a: T | undefined, b: T | undefined) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return a < b ? a : b;
}

export function maxValue<T extends bigint | number>(a: T | undefined, b: T | undefined) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return a > b ? a : b;
}

/**
 * Convert a number or bigint to a hex string of a valid "even" hex length
 */
export function toHex(value: number | bigint) {
    const hex = value.toString(16);
    return hex.length % 2 === 0 ? hex : `0${hex}`;
}

/**
 * Makes sure a value is within min and max. It sets the value to min or max in case it is below or above the range.
 */
export function cropValueRange(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Adds a value to another value and wraps around on the min and max values.
 */
export function addValueWithOverflow(value: number, add: number, min: number, max: number): number {
    const newValue = value + add;
    if (newValue < min) {
        return newValue - min + max;
    } else if (newValue > max) {
        return newValue - max + min;
    }
    return newValue;
}
