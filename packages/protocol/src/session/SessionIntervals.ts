/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Hours, Logger, Millis, Seconds } from "@matter/general";

const logger = Logger.get("SessionIntervals");

export interface SessionIntervals {
    /**
     * Minimum amount of time between sender retries when the destination node is idle. This SHALL be greater than or
     * equal to the maximum amount of time a node may be non-responsive to incoming messages when idle.
     *
     * Default: 500ms
     */
    idleInterval: Duration;

    /**
     * Minimum amount of time between sender retries when the destination node is active. This SHALL be greater than or
     * equal to the maximum amount of time a node may be non-responsive to incoming messages when active.
     *
     * Default: 300ms
     */
    activeInterval: Duration;

    /**
     * Minimum amount of time the node SHOULD stay active after network activity.
     *
     * Default: 4000ms
     */
    activeThreshold: Duration;
}

export function SessionIntervals(intervals?: Partial<SessionIntervals>): SessionIntervals {
    return {
        idleInterval: intervals?.idleInterval ?? SessionIntervals.defaults.idleInterval,
        activeInterval: intervals?.activeInterval ?? SessionIntervals.defaults.activeInterval,
        activeThreshold: intervals?.activeThreshold ?? SessionIntervals.defaults.activeThreshold,
    };
}

export namespace SessionIntervals {
    export const defaults: SessionIntervals = {
        idleInterval: Millis(500),
        activeInterval: Millis(300),
        activeThreshold: Seconds(4),
    };

    /**
     * Maximum SII/SAI the DNS-SD operational advertisement may carry. This bound is a property of the advertisement
     * encoding only; SII/SAI in the CASE/PASE session-parameter struct are uint32 and accepted unbounded.
     *
     * @see {@link MatterSpecification.v13.Core} § 4.3.4
     */
    export const maxAdvertisedInterval = Hours.one;

    /**
     * Maximum Session Active Threshold. Unlike SII/SAI this bound applies everywhere: SAT is a uint16 millisecond
     * value both in the DNS-SD advertisement and in the CASE/PASE session-parameter struct.
     */
    export const maxActiveThreshold = Millis(65535);

    /**
     * Resolve intervals for DNS-SD advertisement, clamping each to its spec maximum. Out-of-range values are reduced to
     * the maximum rather than rejected, matching the reference SDK.
     */
    export function forAdvertisement(intervals?: Partial<SessionIntervals>): SessionIntervals {
        const resolved = SessionIntervals(intervals);

        if (resolved.idleInterval > maxAdvertisedInterval) {
            logger.info(
                `Capping advertised Session Idle Interval ${Duration.format(resolved.idleInterval)} to ${Duration.format(maxAdvertisedInterval)}`,
            );
            resolved.idleInterval = maxAdvertisedInterval;
        }
        if (resolved.activeInterval > maxAdvertisedInterval) {
            logger.info(
                `Capping advertised Session Active Interval ${Duration.format(resolved.activeInterval)} to ${Duration.format(maxAdvertisedInterval)}`,
            );
            resolved.activeInterval = maxAdvertisedInterval;
        }
        if (resolved.activeThreshold > maxActiveThreshold) {
            logger.info(
                `Capping advertised Session Active Threshold ${Duration.format(resolved.activeThreshold)} to ${Duration.format(maxActiveThreshold)}`,
            );
            resolved.activeThreshold = maxActiveThreshold;
        }

        return resolved;
    }
}
