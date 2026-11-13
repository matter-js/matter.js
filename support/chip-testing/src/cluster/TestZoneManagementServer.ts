/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, Seconds, Timer } from "@matter/general";
import { ZoneManagementServer } from "@matter/main/behaviors/zone-management";
import { ZoneManagement } from "@matter/main/clusters/zone-management";

const logger = Logger.get("TestZoneManagementServer");

const TICK = Seconds.one;

/**
 * Activity tracking of one zone, counted in seconds as ticks of {@link TICK}.
 */
interface ZoneActivity {
    trigger: ZoneManagement.ZoneTriggerControl;
    inBlindDuration: boolean;
    timeSinceInitialTrigger: number;
    triggerDetectedDuration: number;
    previousTriggerDetectedDuration: number;
    triggerCount: number;
    remainingBlindDuration: number;
}

/**
 * Zone management with simulated activity detection for the tests CHIP runs against its camera-app.
 *
 * {@link simulateActivity} follows the trigger handling of the CHIP camera-app `ZoneManager`, including its one-second
 * tick, so that the test timing matches.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 2.14.5.9
 */
export class TestZoneManagementServer extends ZoneManagementServer.with(
    "TwoDimensionalCartesianZone",
    "PerZoneSensitivity",
    "UserDefined",
    "FocusZones",
) {
    declare protected internal: TestZoneManagementServer.Internal;

    override initialize() {
        super.initialize();
        this.internal.tickTimer = this.periodicReactorTimer("Zone activity", TICK, this.#tick);
    }

    /**
     * Handle activity detected in a zone, as the application of a camera would.
     */
    simulateActivity(zoneId: number) {
        const trigger = this.state.triggers.find(entry => entry.zoneId === zoneId);
        if (trigger === undefined) {
            logger.info(`Ignoring activity in zone ${zoneId} without a trigger`);
            return;
        }

        const { activities } = this.internal;
        const activity = activities.get(zoneId);
        if (activity === undefined) {
            this.events.zoneTriggered.emit(
                { zone: zoneId, reason: ZoneManagement.ZoneEventTriggeredReason.Motion },
                this.context,
            );
            activities.set(zoneId, {
                trigger,
                inBlindDuration: false,
                timeSinceInitialTrigger: 0,
                triggerDetectedDuration: trigger.initialDuration,
                previousTriggerDetectedDuration: trigger.initialDuration,
                triggerCount: 1,
                remainingBlindDuration: trigger.blindDuration,
            });
            const { tickTimer } = this.internal;
            if (!tickTimer?.isRunning) {
                tickTimer?.start();
            }
            return;
        }

        if (activity.inBlindDuration) {
            return;
        }

        activity.triggerCount++;
        if (activity.triggerCount <= 2 || activity.timeSinceInitialTrigger > activity.previousTriggerDetectedDuration) {
            activity.previousTriggerDetectedDuration = activity.triggerDetectedDuration;
            activity.triggerDetectedDuration += activity.trigger.augmentationDuration;
        }
    }

    #tick() {
        const { activities } = this.internal;
        for (const [zoneId, activity] of activities) {
            if (!activity.inBlindDuration) {
                activity.timeSinceInitialTrigger++;
                if (activity.timeSinceInitialTrigger > activity.triggerDetectedDuration) {
                    this.#stop(zoneId, activity, ZoneManagement.ZoneEventStoppedReason.ActionStopped);
                } else if (activity.timeSinceInitialTrigger > activity.trigger.maxDuration) {
                    this.#stop(zoneId, activity, ZoneManagement.ZoneEventStoppedReason.Timeout);
                }
            }

            // As in camera-app, the tick that stops the zone also counts as its first second of blind duration
            if (activity.inBlindDuration) {
                activity.remainingBlindDuration--;
                if (activity.remainingBlindDuration <= 0) {
                    activities.delete(zoneId);
                }
            }
        }

        if (!activities.size) {
            this.internal.tickTimer?.stop();
        }
    }

    #stop(zoneId: number, activity: ZoneActivity, reason: ZoneManagement.ZoneEventStoppedReason) {
        this.events.zoneStopped.emit({ zone: zoneId, reason }, this.context);
        activity.inBlindDuration = true;
    }
}

export namespace TestZoneManagementServer {
    export class Internal {
        tickTimer?: Timer;
        activities = new Map<number, ZoneActivity>();
    }
}
