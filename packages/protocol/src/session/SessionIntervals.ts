/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";

export interface SessionIntervals {
    /**
     * Minimum amount of time between sender retries when the destination node is idle. This SHALL be greater than or
     * equal to the maximum amount of time a node may be non-responsive to incoming messages when idle.
     *
     * Default: 500ms
     */
    idleIntervalMs: number;

    /**
     * Minimum amount of time between sender retries when the destination node is active. This SHALL be greater than or
     * equal to the maximum amount of time a node may be non-responsive to incoming messages when active.
     *
     * Default: 300ms
     */
    activeIntervalMs: number;

    /**
     * Minimum amount of time the node SHOULD stay active after network activity.
     *
     * Default: 4000ms
     */
    activeThresholdMs: number;
}

export function SessionIntervals(intervals?: Partial<SessionIntervals>): SessionIntervals {
    const reified = { ...SessionIntervals.defaults, ...intervals };
    const { idleIntervalMs, activeIntervalMs, activeThresholdMs } = reified;

    if (idleIntervalMs !== undefined && idleIntervalMs > 3600000) {
        throw new ImplementationError("Session Idle Interval must be less than 1 hour");
    }
    if (activeIntervalMs !== undefined && activeIntervalMs > 3600000) {
        throw new ImplementationError("Session Active Interval must be less than 1 hour");
    }
    if (activeThresholdMs !== undefined && activeThresholdMs > 65535) {
        throw new ImplementationError("Session Active Threshold must be less than 65535 seconds");
    }

    return reified;
}

export namespace SessionIntervals {
    export const defaults = {
        idleIntervalMs: 500,
        activeIntervalMs: 300,
        activeThresholdMs: 4000,
    };
}
