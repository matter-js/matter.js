/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration } from "./Duration.js";
import { Timestamp } from "./Timestamp.js";

/**
 * A period between two {@link Timestamp}s.
 */
export interface Timespan {
    start: Timestamp;
    stop: Timestamp;
    duration: Duration;

    from(newStart: Timestamp.Definition): Timespan;
    to(newStart: Timestamp.Definition): Timespan;
    valueOf(): { start: Timestamp; stop: Timestamp };
}

/**
 * Create a new timespan representing time between {@link start} and {@link stop}.
 */
export function Timespan(start: Timestamp.Definition, stop: Timestamp.Definition) {
    return Object.create(prototype, {
        start: { value: Timestamp(start), enumerable: true },
        stop: { value: Timestamp(stop), enumerable: true },
    }) as Timespan;
}

const prototype: Timespan = {
    start: 0 as Timestamp,
    stop: 0 as Timestamp,

    get duration() {
        return (this.stop - this.start) as Duration;
    },

    from(this: Timespan, newStart) {
        return Timespan(newStart, this.stop);
    },

    to(this: Timespan, newStop) {
        return Timespan(this.start, newStop);
    },

    valueOf(this: Timespan) {
        return { start: this.start, stop: this.stop };
    },
};
