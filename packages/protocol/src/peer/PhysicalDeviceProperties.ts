/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Instant, Logger, Millis, Minutes, Seconds, UINT16_MAX } from "@matter/general";
import { GenericSwitchDt } from "@matter/model";
import { DeviceTypeId } from "@matter/types";

const logger = Logger.get("PhysicalDeviceProperties");

const DEFAULT_SUBSCRIPTION_FLOOR_DEFAULT = Instant;
const DEFAULT_SUBSCRIPTION_FLOOR_THREAD_LEGACY = Seconds(1);
const DEFAULT_SUBSCRIPTION_FLOOR_ICD = Instant;

// specificationVersion encoding for Matter 1.3.0; the attribute was introduced in 1.3, so an absent/lower value means
// the peer predates 1.3.
const SPEC_VERSION_1_3 = 0x0103_0000;

// A Generic Switch endpoint opts a legacy-Thread device back into a 0s floor so switch events are delivered without
// delay.
const GENERIC_SWITCH_DEVICE_TYPE = DeviceTypeId(GenericSwitchDt.id);
const DEFAULT_SUBSCRIPTION_CEILING_WIFI = Minutes(1);
const DEFAULT_SUBSCRIPTION_CEILING_THREAD = Minutes(1);
const DEFAULT_SUBSCRIPTION_CEILING_THREAD_SLEEPY = Minutes(3);
const DEFAULT_SUBSCRIPTION_CEILING_BATTERY_POWERED = Minutes(10);
const SUBSCRIPTION_CEILING_JITTER = 0.1; // up to +10% jitter on the Subscription ceiling time
const SUBSCRIPTION_CEILING_JITTER_MIN = Seconds(10); // ... but at least +10s so smaller ceilings spread meaningfully
const MAX_SUBSCRIPTION_CEILING = Seconds(UINT16_MAX); // uint16-seconds wire maximum for subscription maxInterval

export interface PhysicalDeviceProperties {
    supportsThread: boolean;
    supportsWifi: boolean;
    supportsEthernet: boolean;
    rootEndpointServerList: number[];
    isMainsPowered: boolean;
    isBatteryPowered: boolean;
    isIntermittentlyConnected: boolean;

    /** Peer is operating in Long Idle Time mode — controller must await a notification (Check-In or subscription report) before sending. */
    isLongIdleTimeOperating: boolean;

    /** For an intermittently-connected peer, the peer's IcdManagement.idleModeDuration (converted to Duration). */
    idleModeDuration?: Duration;

    isThreadSleepyEndDevice: boolean;
    specificationVersion?: number;

    /** Device type IDs present on any endpoint of the node. */
    deviceTypes?: Set<DeviceTypeId>;
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
            idleModeDuration,
            threadActive,
            specificationVersion,
            deviceTypes,
        } = properties ?? {};

        if (isIntermittentlyConnected && minIntervalFloor !== DEFAULT_SUBSCRIPTION_FLOOR_ICD) {
            // Only announce the override when the caller supplied the floor; our own defaulting runs afterwards.
            if (request?.minIntervalFloor !== undefined) {
                logger.info(
                    `${description}: Overwriting minIntervalFloorSeconds for intermittently connected device to ${Duration.format(DEFAULT_SUBSCRIPTION_FLOOR_ICD)}`,
                );
            }
            minIntervalFloor = DEFAULT_SUBSCRIPTION_FLOOR_ICD;
        }
        if (minIntervalFloor === undefined) {
            // Only pre-1.3 Thread devices keep a 1s floor to spare the mesh; a Generic Switch endpoint opts back into a
            // 0s floor so switch events are delivered without delay.
            const onThread =
                threadActive === true ||
                (threadActive === undefined && (supportsThread === true || isThreadSleepyEndDevice === true));
            const preMatter13 = (specificationVersion ?? 0) < SPEC_VERSION_1_3;
            const hasGenericSwitch = deviceTypes?.has(GENERIC_SWITCH_DEVICE_TYPE) ?? false;
            minIntervalFloor =
                onThread && preMatter13 && !hasGenericSwitch
                    ? DEFAULT_SUBSCRIPTION_FLOOR_THREAD_LEGACY
                    : DEFAULT_SUBSCRIPTION_FLOOR_DEFAULT;
        }

        const isIcdCeiling = isIntermittentlyConnected && idleModeDuration !== undefined;
        const defaultCeiling = isIcdCeiling
            ? Duration.min(idleModeDuration, MAX_SUBSCRIPTION_CEILING)
            : isBatteryPowered && !isMainsPowered
              ? DEFAULT_SUBSCRIPTION_CEILING_BATTERY_POWERED
              : isThreadSleepyEndDevice
                ? DEFAULT_SUBSCRIPTION_CEILING_THREAD_SLEEPY
                : supportsThread
                  ? DEFAULT_SUBSCRIPTION_CEILING_THREAD
                  : DEFAULT_SUBSCRIPTION_CEILING_WIFI;
        if (maxIntervalCeiling === undefined) {
            maxIntervalCeiling = defaultCeiling;
        }
        if (!isIcdCeiling && maxIntervalCeiling < defaultCeiling) {
            logger.debug(
                `${description}: maxIntervalCeilingSeconds ideally is ${Duration.format(defaultCeiling)} instead of ${Duration.format(maxIntervalCeiling)} due to device type`,
            );
        }

        if (isIcdCeiling) {
            // The ICD peer reports on its own idleModeDuration clock regardless of our requested ceiling, so jitter
            // would only push our request above idle for no benefit.
            maxIntervalCeiling = Duration.max(minIntervalFloor, maxIntervalCeiling);
        } else {
            // Lengthen the ceiling by jitter (added, never subtracted) to spread out device responses when devices
            // are longer idle, so it cannot increase report frequency (and thus traffic) on the mesh. The result is
            // floored to whole seconds (the wire granularity). Clamp to the floor so a requested ceiling below the
            // floor still yields a usable value.
            const maxJitter = Math.max(
                maxIntervalCeiling * SUBSCRIPTION_CEILING_JITTER,
                SUBSCRIPTION_CEILING_JITTER_MIN,
            );
            const jitter = Math.round(maxJitter * Math.random());
            maxIntervalCeiling = Duration.max(
                minIntervalFloor,
                Seconds(Seconds.of(Millis(maxIntervalCeiling + jitter))),
            );
        }
        maxIntervalCeiling = Duration.min(maxIntervalCeiling, MAX_SUBSCRIPTION_CEILING);

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
