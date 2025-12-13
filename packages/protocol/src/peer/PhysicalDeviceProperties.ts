/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Instant, Logger, Minutes, Seconds } from "#general";

const logger = Logger.get("PhysicalDeviceProperties");

const DEFAULT_SUBSCRIPTION_FLOOR_DEFAULT = Seconds(1);
const DEFAULT_SUBSCRIPTION_FLOOR_ICD = Instant;
const DEFAULT_SUBSCRIPTION_CEILING_WIFI = Minutes(1);
const DEFAULT_SUBSCRIPTION_CEILING_THREAD = Minutes(1);
const DEFAULT_SUBSCRIPTION_CEILING_THREAD_SLEEPY = Minutes(3);
const DEFAULT_SUBSCRIPTION_CEILING_BATTERY_POWERED = Minutes(10);

export interface PhysicalDeviceProperties {
    threadConnected: boolean;
    wifiConnected: boolean;
    ethernetConnected: boolean;
    rootEndpointServerList: number[];
    isMainsPowered: boolean;
    isBatteryPowered: boolean;
    isIntermittentlyConnected: boolean;
    isThreadSleepyEndDevice: boolean;
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
            threadConnected,
            isThreadSleepyEndDevice,
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
                  : threadConnected
                    ? DEFAULT_SUBSCRIPTION_CEILING_THREAD
                    : DEFAULT_SUBSCRIPTION_CEILING_WIFI;
        if (maxIntervalCeiling === undefined) {
            maxIntervalCeiling = defaultCeiling;
        }
        if (maxIntervalCeiling < defaultCeiling) {
            logger.debug(
                `${description}: maxIntervalCeilingSeconds ideally is ${Duration.format(defaultCeiling)}s instead of ${Duration.format(maxIntervalCeiling)}s due to device type`,
            );
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
