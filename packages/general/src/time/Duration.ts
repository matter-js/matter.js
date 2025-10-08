/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnexpectedDataError } from "#MatterError.js";
import { Branded } from "#util/Type.js";
import type { Millis, Seconds, TimeUnit } from "./TimeUnit.js";

/**
 * A time interval.
 *
 * You can create an interval using a {@link TimeUnit} factory such as {@link Seconds}.
 *
 * Regardless of the input unit, intervals are stored as milliseconds.  You can use {@link TimeUnit#of} to convert an
 * interval to the correct unit.
 *
 * Math operators always result in millisecond values and can thus be converted back to an interval using
 * {@link Millis}.  For example, `Millisecs(Hours(1) + Minutes(30))` would produce a 90 minute {@link Duration}.
 */
export type Duration = Branded<number, "Duration"> | 0;

/**
 * Create an interval from a number or string.
 */
export function Duration<T extends Duration | string>(source: T): Duration {
    if (typeof source === "string") {
        return Duration.parse(source);
    }

    if (typeof source === "number") {
        if (!Number.isFinite(source)) {
            throw new DurationFormatError(`A duration must be a finite number`);
        }
        return source;
    }

    throw new DurationFormatError(`Interval value is not a number (received ${typeof source})`);
}

/**
 * Thrown when a textual duration cannot be parsed.
 */
export class DurationFormatError extends UnexpectedDataError {}

export namespace Duration {
    /**
     * Determine the greater of two intervals.
     */
    export function max(a: Duration, b: Duration) {
        if (b > a) {
            return b;
        }
        return a;
    }

    /**
     * Determine the lesser of two intervals.
     */
    export function min(a: Duration, b: Duration) {
        if (b < a) {
            return b;
        }
        return a;
    }

    /**
     * Convert an interval to a compact human readable string.
     */
    export function format<T extends Duration | undefined>(
        duration: T,
    ): T extends undefined ? string | undefined : string {
        if (duration === undefined) {
            return undefined as T extends undefined ? string | undefined : string;
        }
        let ms = duration as number;

        if (typeof ms !== "number" || !Number.isFinite(ms)) {
            return "invalid";
        }

        switch (ms) {
            case 0:
                return "0";

            case Infinity:
                return "forever";

            case -Infinity:
                return "until now"; // Umm...  I guess?
        }

        if (ms < 0) {
            return `${toPrecision(ms * 1000, 3)}μs`;
        } else if (ms < 1000) {
            return `${toPrecision(ms, 3)}ms`;
        } else if (ms < 60000) {
            return `${toPrecision(ms / 1000, 3)}s`;
        }

        const parts = Array<string>();

        if (ms > 86_400_000) {
            parts.push(`${Math.floor(ms / 86_400_000)}d`);
            ms %= 86_400_000;
        }

        const hours = Math.floor(ms / 3_600_000);
        if (hours) {
            parts.push(`${hours}h`);
        }
        ms %= 3_600_000;

        const minutes = Math.floor(ms / 60_000);
        if (minutes) {
            parts.push(`${minutes}m`);
        }
        ms %= 60_000;

        const seconds = Math.floor(ms / 1_000);
        if (seconds) {
            parts.push(`${seconds}s`);
        }

        return parts.join(" ");
    }

    /**
     * Parse a string into an interval.
     */
    export function parse(text: string) {
        const parts = text.split(/\s+/).filter(part => part !== "");

        let interval = 0;
        for (const part of parts) {
            const suffix = text.match(/[a-zμ]+/i)?.[1];
            if (suffix === undefined) {
                throw new DurationFormatError(`Interval component "${part}" is missing an time suffix`);
            }

            const value = Number(text.slice(text.length - suffix.length));
            if (!Number.isFinite(value)) {
                throw new DurationFormatError(`Interval component "${part}" contains no numeric component`);
            }

            switch (suffix.toLowerCase()) {
                case "μs":
                case "us":
                    interval += value / 1000;
                    break;

                case "ms":
                    interval += value;
                    break;

                case "s":
                    interval += value * 1000;
                    break;

                case "m":
                    interval += value * 60_000;
                    break;

                case "h":
                    interval += value * 3_600_000;
                    break;

                case "d":
                    interval += value * 86_400_000;
                    break;

                default:
                    throw new DurationFormatError(`Interval component ${part} contains an unsupported unit suffix`);
            }
        }

        return interval as Duration;
    }
}

function toPrecision(number: number, precision: number) {
    // Remove trailing zeros after a non-zero decimal digit, then remove any trailing '.0'
    return number
        .toPrecision(precision)
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.0+$/, "");
}
