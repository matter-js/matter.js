/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto } from "#crypto/Crypto.js";

/**
 * An iterable of retry values based on a scheduling configuration.
 */
export class RetrySchedule {
    #crypto: Crypto;
    readonly config: RetrySchedule.Configuration;

    constructor(crypto: Crypto, config: RetrySchedule.Configuration) {
        this.#crypto = crypto;
        this.config = config;
    }

    /**
     * Yields intervals.
     *
     * Will yield indefinitely until canceled unless {@link config} specifies a timeout.
     */
    *[Symbol.iterator]() {
        const {
            timeout,
            maximumInterval,
            maximumCount,
            jitterFactor = 0,
            initialInterval = 1000,
            backoffFactor = 2,
        } = this.config;

        let count = 0;
        let baseInterval = initialInterval;
        let timeSoFar = 0;

        while ((timeout === undefined || timeSoFar < timeout) && (maximumCount === undefined || maximumCount > count)) {
            count++;
            const maxJitter = jitterFactor * baseInterval;
            const jitter = Math.floor((2 * maxJitter * this.#crypto.randomUint32) / Math.pow(2, 32) - maxJitter);
            let interval = baseInterval + jitter;

            if (timeout !== undefined && timeSoFar + interval > timeout) {
                interval = timeout - timeSoFar;
            }
            if (maximumInterval !== undefined && interval > maximumInterval) {
                interval = maximumInterval;
            }

            yield interval;
            timeSoFar += interval;

            baseInterval *= backoffFactor;
        }
    }
}

export namespace RetrySchedule {
    /**
     * Configuration parameters for retry schedule.
     *
     * All intervals are in milliseconds.
     */
    export interface Configuration {
        /**
         * Overall timeout in seconds.
         *
         * Leave undefined to allow indefinite transmission.
         */
        readonly timeout?: number;

        /**
         * Maximum number of occurrences (including first).
         *
         * Set to zero to disable transmission completely; leave undefined to allow any number of transmissions.
         */
        readonly maximumCount?: number;

        /**
         * Interval between first request and final interval.
         *
         * Defaults to 1000 ms.
         */
        readonly initialInterval?: number;

        /**
         * Multiplier for subsequent retries.
         *
         * Defaults to 2.
         */
        readonly backoffFactor?: number;

        /**
         * Maximum interval between retries (excluding jitter).
         *
         * Leave undefined for interval to allow interval to grow continuously.
         */
        readonly maximumInterval?: number;

        /**
         * Multiplier for retry jitter.
         *
         * Leave undefined to disable jitter.
         */
        readonly jitterFactor?: number;
    }

    /**
     * Create a full configuration with defaults.
     */
    export function Configuration(defaults: Configuration, config?: Configuration) {
        return {
            ...defaults,
            ...config,
        };
    }
}
