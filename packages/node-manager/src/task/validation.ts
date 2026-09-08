/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";

/**
 * Checks a task definition applies to the parameters it is handed.
 *
 * These throw {@link ImplementationError} because a caller passing the wrong shape to `run()` has made a
 * programming mistake. The same check also runs against parameters read back from storage, where it is not
 * the caller's mistake — so the verbs that bind a stored record wrap it in a coded refusal instead.
 */
export const Require = {
    /** An unsigned integer within `max`, inclusive. */
    uint(field: string, value: unknown, max: number): void {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
            throw new ImplementationError(`"${field}" must be an integer in 0..${max}, not ${describe(value)}`);
        }
    },

    /** A byte array of exactly `length` bytes. */
    bytes(field: string, value: unknown, length: number): void {
        if (!(value instanceof Uint8Array)) {
            throw new ImplementationError(`"${field}" must be a Uint8Array, not ${describe(value)}`);
        }
        if (value.length !== length) {
            throw new ImplementationError(`"${field}" must be ${length} bytes, not ${value.length}`);
        }
    },

    /** A non-empty string. */
    text(field: string, value: unknown): void {
        if (typeof value !== "string" || value === "") {
            throw new ImplementationError(`"${field}" must be a non-empty string, not ${describe(value)}`);
        }
    },

    /** A non-negative bigint. */
    epoch(field: string, value: unknown): void {
        if (typeof value !== "bigint" || value < 0n) {
            throw new ImplementationError(`"${field}" must be a non-negative bigint, not ${describe(value)}`);
        }
    },

    /** An object, so a definition may read its fields at all. */
    params(type: string, value: unknown): void {
        if (typeof value !== "object" || value === null) {
            throw new ImplementationError(`Parameters for task "${type}" must be an object, not ${describe(value)}`);
        }
    },
};

/**
 * Names a rejected value without reproducing it.
 *
 * Task parameters carry raw group keys, so a message that echoed the value would put key material into logs.
 * A bigint would also defeat `JSON.stringify` outright.
 */
function describe(value: unknown): string {
    if (value === null) {
        return "null";
    }
    if (value instanceof Uint8Array) {
        return `${value.length} bytes`;
    }
    return typeof value;
}
