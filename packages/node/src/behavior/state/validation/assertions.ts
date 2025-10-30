/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, isObject } from "#general";
import { SchemaErrorPath } from "#model";
import { DatatypeError, IntegerRangeError, Val } from "#protocol";

export function assertNumber(value: Val, path: SchemaErrorPath): asserts value is number {
    if (Number.isFinite(value)) {
        return;
    }
    throw new DatatypeError(path, "a number", value);
}

export function assertBoolean(value: Val, path: SchemaErrorPath): asserts value is number {
    if (typeof value === "boolean" || value === 0 || value === 1) {
        return;
    }
    throw new DatatypeError(path, "a boolean", value);
}

export function assertObject(value: Val, path: SchemaErrorPath): asserts value is Val.Struct {
    if (isObject(value)) {
        return;
    }
    throw new DatatypeError(path, "an object", value);
}

export function assertNumeric(value: Val, path: SchemaErrorPath): asserts value is number | bigint {
    if (typeof value === "number" || typeof value === "bigint") {
        return;
    }
    throw new DatatypeError(path, "a number or bigint", value);
}

export function assertString(value: Val, path: SchemaErrorPath): asserts value is string {
    if (typeof value === "string") {
        return;
    }
    throw new DatatypeError(path, "a string", value);
}

export function assertBytes(value: Val, path: SchemaErrorPath): asserts value is Bytes {
    if (Bytes.isBytes(value)) {
        return;
    }
    throw new DatatypeError(path, "a byte array", value);
}

export function assertSequence(value: Val, path: SchemaErrorPath): asserts value is string | Bytes {
    if (typeof value === "string" || Bytes.isBytes(value)) {
        return;
    }
    throw new DatatypeError(path, "a string or byte array", value);
}

export function assertArray(value: Val, path: SchemaErrorPath): asserts value is Val[] {
    if (!Array.isArray(value)) {
        throw new DatatypeError(path, "an array", value);
    }
}

export const assertInt = {
    /**
     * Assertions for each integer type that is not nullable.
     */
    notNullable: {} as Record<string, typeof assertNumeric | undefined>,

    /**
     * Assertions for nullable integer types.
     *
     * These are separate from the "not nullable" assertions because Matter reserves a high or low value (for unsigned
     * and signed, respectively) to indicate the field is null.
     */
    nullable: {} as Record<string, typeof assertNumeric | undefined>,
};

for (let i = 1n; i < 9n; i++) {
    const intName = `int${i * 8n}`;
    const uintName = `u${intName}`;

    const numValues = 2n ** (i * 8n);
    const unsignedMax = numValues - 1n;
    assertInt.notNullable[uintName] = createIntAssertion(uintName, 0n, unsignedMax);
    assertInt.nullable[uintName] = createIntAssertion(`nullable ${uintName}`, 0n, unsignedMax - 1n);

    const halfNumValues = numValues / 2n;
    const signedMax = halfNumValues - 1n;
    const signedMin = -halfNumValues;
    assertInt.notNullable[intName] = createIntAssertion(intName, signedMin, signedMax);
    assertInt.nullable[intName] = createIntAssertion(`nullable ${intName}`, signedMin + 1n, signedMax);
}

function createIntAssertion(name: string, lowerBoundInclusive: bigint, upperBoundExclusive: bigint) {
    if (lowerBoundInclusive < Number.MIN_SAFE_INTEGER || upperBoundExclusive > Number.MAX_SAFE_INTEGER) {
        return createVarIntAssertion(name, lowerBoundInclusive, upperBoundExclusive);
    }

    return createVarIntAssertion(name, Number(lowerBoundInclusive), Number(upperBoundExclusive));
}

function createVarIntAssertion(name: string, min: bigint | number, max: bigint | number): typeof assertNumeric {
    return function assertInt(value, path) {
        assertNumeric(value, path);

        if (value < min) {
            throw new IntegerRangeError(path, `Value ${value} is below the ${name} minimum of ${min}`);
        }

        if (value > max) {
            throw new IntegerRangeError(path, `Value ${value} is above the ${name} maximum of ${max}`);
        }
    };
}
