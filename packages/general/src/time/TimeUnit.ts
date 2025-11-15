/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsStyleInspectable } from "#log/NodeJsStyleInspectable.js";
import { Duration } from "./Duration.js";

/**
 * Details of a specific unit of time.
 */
export interface TimeUnit {
    (scale: number | bigint): Duration;
    (scale: undefined | number | bigint): undefined | Duration;

    /**
     * Long name of the unit.
     */
    readonly kind: TimeUnit.Kind;

    /**
     * Abbreviated name of the unit.
     */
    readonly abbrev: string;

    /**
     * An interval representing a single unit.
     */
    readonly one: Duration;

    /**
     * Convert an interval to an integer of this unit.
     *
     * Produces an even integer result.  Use {@link fractionalOf} to retain any fractional component.
     */
    of<T extends Duration | undefined>(interval: T): T extends undefined ? number | undefined : number;

    /**
     * Convert an interval to this unit, retaining fractional component.
     */
    fractionalOf<T extends Duration | undefined>(interval: T): T extends undefined ? number | undefined : number;

    /**
     * Compute the ceiling of an interval in this unit.
     */
    ceil(duration: Duration): Duration;

    /**
     * Compute the floor of an interval in this unit.
     */
    floor(duration: Duration): Duration;

    /**
     * Round an interval to this unit.
     */
    round(duration: Duration): Duration;

    length: never;
}

export namespace TimeUnit {
    /**
     * Standard time units.
     */
    export type Kind = "microsecond" | "millisecond" | "second" | "minute" | "hour" | "day";
}

/**
 * Implement a {@link TimeUnit}.
 */
export function TimeUnit<T = {}>(kind: TimeUnit.Kind, abbrev: string, one: number, props = {} as T): TimeUnit & T {
    const unit = {
        [kind]: (scale: undefined | number | bigint) => {
            if (scale === undefined) {
                return undefined;
            }
            if (typeof scale === "bigint") {
                scale = Number(scale);
            }
            return (scale * one) as Duration;
        },
    }[kind] as TimeUnit & T;

    // Add properties to the function
    Object.assign(unit, {
        ...props,
        kind,
        abbrev,
        one,
        of,
        fractionalOf,
        ceil,
        floor,
        round,
        toString: kindOf,
    });

    NodeJsStyleInspectable(unit, kindOf);

    return unit;
}

function of(this: TimeUnit, duration: Duration) {
    return Math.floor(duration / this.one);
}

function fractionalOf(this: TimeUnit, duration: Duration) {
    return duration / this.one;
}

function ceil(this: TimeUnit, duration: Duration) {
    return Math.ceil(duration / this.one) * this.one;
}

function floor(this: TimeUnit, duration: Duration) {
    return Math.floor(duration / this.one) * this.one;
}

function round(this: TimeUnit, duration: Duration) {
    return Math.round(duration / this.one) * this.one;
}

function kindOf(this: TimeUnit) {
    return this.kind;
}

/**
 * Create an interval in microseconds.
 */
export const Microseconds = TimeUnit("microsecond", "μs", 0.001);

/**
 * Create an interval in milliseconds.
 */
export const Millis = TimeUnit("millisecond", "ms", 1);

/**
 * Create an interval in seconds.
 */
export const Seconds = TimeUnit("second", "s", 1_000);

/**
 * Create an interval in minutes.
 */
export const Minutes = TimeUnit("minute", "m", 60_000);

/**
 * Create an interval in hours.
 */
export const Hours = TimeUnit("hour", "h", 3_600_000);

/**
 * Create an interval in days.
 */
export const Days = TimeUnit("day", "d", 86_400_000);

/**
 * A zero-length interval.
 */
export const Instant = Millis(0);
