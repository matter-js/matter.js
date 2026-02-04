/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Instant, Logger, Millis, Minutes, Seconds } from "#general";

const logger = Logger.get("PhysicalDeviceProperties");

const DEFAULT_SUBSCRIPTION_FLOOR_DEFAULT = Seconds(1);
const DEFAULT_SUBSCRIPTION_FLOOR_ICD = Instant;
const DEFAULT_SUBSCRIPTION_CEILING_WIFI = Minutes(1);
const DEFAULT_SUBSCRIPTION_CEILING_THREAD = Minutes(1);
const DEFAULT_SUBSCRIPTION_CEILING_THREAD_SLEEPY = Minutes(3);
const DEFAULT_SUBSCRIPTION_CEILING_BATTERY_POWERED = Minutes(10);
const THREAD_SUBSCRIPTION_CEILING_JITTER = 0.05; // 5% +/- Jitter for the Subscription ceiling time

export interface PhysicalDeviceProperties {
    supportsThread: boolean;
    supportsWifi: boolean;
    supportsEthernet: boolean;
    rootEndpointServerList: number[];
    isMainsPowered: boolean;
    isBatteryPowered: boolean;
    isIntermittentlyConnected: boolean;
    isThreadSleepyEndDevice: boolean;
    threadActive?: boolean;
    threadPan?: bigint;
    threadChannel?: number;
}

export namespace PhysicalDeviceProperties {
    export function subscriptionIntervalBoundsFor(options?: {
        properties?: PhysicalDeviceProperties;
        description?: string;
        request?: Partial<PhysicalDeviceProperties.IntervalBounds>;
    }): PhysicalDeviceProperties.IntervalBounds {
        const { properties, request } = options ?? {};

        let { description } = options ?? {};

        let minIntervalFloor, maxIntervalCeiling;
        if (request) {
            ({ minIntervalFloor, maxIntervalCeiling } = request);
        }

        if (description === undefined) {
            description = "Node";
        }

        const {
            isMainsPowered,
            isBatteryPowered,
            isIntermittentlyConnected,
            supportsThread,
            isThreadSleepyEndDevice,
            threadActive,
        } = properties ?? {};

        if (isIntermittentlyConnected) {
            if (minIntervalFloor !== undefined && minIntervalFloor !== DEFAULT_SUBSCRIPTION_FLOOR_ICD) {
                logger.info(
                    `${description}: Overwriting minIntervalFloorSeconds for intermittently connected device to ${Duration.format(DEFAULT_SUBSCRIPTION_FLOOR_ICD)}`,
                );
                minIntervalFloor = DEFAULT_SUBSCRIPTION_FLOOR_ICD;
            }
        }
        if (minIntervalFloor === undefined) {
            minIntervalFloor = DEFAULT_SUBSCRIPTION_FLOOR_DEFAULT;
        }

        const defaultCeiling =
            isBatteryPowered && !isMainsPowered
                ? DEFAULT_SUBSCRIPTION_CEILING_BATTERY_POWERED
                : isThreadSleepyEndDevice
                  ? DEFAULT_SUBSCRIPTION_CEILING_THREAD_SLEEPY
                  : supportsThread
                    ? DEFAULT_SUBSCRIPTION_CEILING_THREAD
                    : DEFAULT_SUBSCRIPTION_CEILING_WIFI;
        if (maxIntervalCeiling === undefined) {
            maxIntervalCeiling = defaultCeiling;
        }
        if (maxIntervalCeiling < defaultCeiling) {
            logger.debug(
                `${description}: maxIntervalCeilingSeconds ideally is ${Duration.format(defaultCeiling)} instead of ${Duration.format(maxIntervalCeiling)} due to device type`,
            );
        }

        if (threadActive) {
            // Add some Jitter to the Subscription ceiling time to ensure the device responses are spread a bit when
            // devices are longer idle
            // Logic does not validate if the resulting value gets too small because our defaults are high enough
            // for this to never happen.
            const maxJitter = maxIntervalCeiling * THREAD_SUBSCRIPTION_CEILING_JITTER;
            const jitter = Math.round(maxJitter * Math.random() * 2 - maxJitter);
            maxIntervalCeiling = Seconds(Seconds.of(Millis(maxIntervalCeiling + jitter)));
        }

        return {
            minIntervalFloor,
            maxIntervalCeiling,
        };
    }
}

export namespace PhysicalDeviceProperties {
    export interface IntervalBounds {
        minIntervalFloor: Duration;
        maxIntervalCeiling: Duration;
    }
}
