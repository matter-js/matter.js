/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export const INTERNAL_INTERVAL_PUBLISHER_LIMIT_S = 3 * 60; /** 3 min */
export const MIN_INTERVAL_S = 2; // We do not send faster than 2 seconds
export const DEFAULT_RANDOMIZATION_WINDOW_S = 10; // 10 seconds

/**
 * Server options that control subscription handling.
 */
export interface ServerSubscriptionConfig {
    /**
     * Optional maximum subscription interval to use for sending subscription reports. It will be used if not too
     * low and inside the range requested by the connected controller.
     */
    maxIntervalSeconds: number;

    /**
     * Optional minimum subscription interval to use for sending subscription reports. It will be used when other
     * calculated values are smaller than it. Use this to make sure your device hardware can handle the load and to
     * set limits.
     */
    minIntervalSeconds: number;

    /**
     * Optional subscription randomization window to use for sending subscription reports. This specifies a window
     * in seconds from which a random part is added to the calculated maximum interval to make sure that devices
     * that get powered on in parallel not all send at the same timepoint.
     */
    randomizationWindowSeconds: number;
}

export namespace ServerSubscriptionConfig {
    /**
     * Validate options and set defaults.
     *
     * @returns the resulting options
     */
    export function of(options?: Partial<ServerSubscriptionConfig>) {
        return {
            maxIntervalSeconds: options?.maxIntervalSeconds ?? INTERNAL_INTERVAL_PUBLISHER_LIMIT_S,
            minIntervalSeconds: Math.max(options?.minIntervalSeconds ?? MIN_INTERVAL_S, MIN_INTERVAL_S),
            randomizationWindowSeconds: options?.randomizationWindowSeconds ?? DEFAULT_RANDOMIZATION_WINDOW_S,
        };
    }
}
