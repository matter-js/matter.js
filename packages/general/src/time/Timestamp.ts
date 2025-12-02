/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnexpectedDataError } from "#MatterError.js";
import { Branded } from "#util/Type.js";
import type { Duration } from "./Duration.js";
import { Time } from "./Time.js";

/**
 * A UNIX epoch timestamp in milliseconds.
 *
 * Note that the precision of the timestamp may be greater than milliseconds but is limited to floating point precision.
 */
export type Timestamp = Branded<number, "Timestamp"> | 0;

/**
 * Create a timestamp.
 *
 * Input may be a UNIX epoch value in milliseconds, a parseable date string, or a {@link Date}.
 */
export function Timestamp<T extends undefined | Timestamp.Definition>(
    source: T,
): T extends undefined ? undefined | Timestamp : Timestamp {
    if (source === undefined) {
        return Time.nowMs;
    }

    if (typeof source === "string") {
        const date = Date.parse(source);
        if (!Number.isFinite(date.valueOf())) {
            throw new TimestampFormatError("Invalid timestamp format");
        }
    } else if (typeof source === "object" && source !== null && source instanceof Date) {
        if (!Number.isFinite(source.valueOf())) {
            throw new TimestampFormatError("Cannot convert date to timestamp because it is invalid");
        }
        source = source.getTime() as T;
    } else if (typeof source === "bigint") {
        source = Number(source) as T;
    }

    if (typeof source === "number") {
        if (!Number.isFinite(source)) {
            throw new TimestampFormatError("A timestamp must be a finite number");
        }
    } else {
        throw new TimestampFormatError(`Timestamp is not a number (received ${typeof source})`);
    }

    return source as Timestamp;
}

/**
 * Thrown when a textual timestamp cannot be parsed.
 */
export class TimestampFormatError extends UnexpectedDataError {}

export namespace Timestamp {
    /**
     * Values that may be used to initialize a timestamp.
     */
    export type Definition = number | bigint | string | Date;

    /**
     * Create a low-resolution timestamp from a seconds value.
     */
    export function fromSeconds(source: number) {
        return Math.floor(source * 1000);
    }

    /**
     * Create a high-resolution timestamp from a microsecond value.
     */
    export function fromMicroseconds(source: number | bigint) {
        if (typeof source === "bigint") {
            source = Number(source);
        }
        return Timestamp(source / 1000);
    }

    /**
     * The UNIX epoch.
     */
    export const zero = Timestamp(0);

    /**
     * Obtain a {@link Date} for a {@link Timestamp}.
     */
    export function dateOf(timestamp: Timestamp) {
        return new Date(timestamp);
    }

    /**
     * Compute the duration between two timestamps.
     */
    export function delta(from: Timestamp, to: Timestamp) {
        return (to - from) as Duration;
    }
}
