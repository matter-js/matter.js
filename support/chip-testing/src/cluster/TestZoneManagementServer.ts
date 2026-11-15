/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Logger, Millis, Seconds, Time, Timer, Timestamp } from "@matter/general";
import { ZoneManagementServer } from "@matter/main/behaviors/zone-management";
import { ZoneManagement } from "@matter/main/clusters/zone-management";

const logger = Logger.get("TestZoneManagementServer");

/**
 * Resolution of the stop and blind-duration checks.
 *
 * The CHIP tests wait one second longer than the expected duration, so the checks run well below one second to report
 * a ZoneStopped event inside that margin.
 */
const CHECK_INTERVAL = Millis(100);

/**
 * Activity tracking of one zone.
 */
interface ZoneActivity {
    trigger: ZoneManagement.ZoneTriggerControl;
    initialTriggerAt: Timestamp;
    triggerDetectedDuration: Duration;
    previousTriggerDetectedDuration: Duration;
    triggerCount: number;
    blindUntil?: Timestamp;
}

/**
 * Zone management with simulated activity detection for the tests CHIP runs against its camera-app.
 *
 * {@link simulateActivity} follows the trigger handling of the CHIP camera-app `ZoneManager`. Unlike the camera-app,
 * which counts whole seconds from the initial trigger, it measures TimeSinceInitialTrigger from a timestamp. A zone
 * therefore stops as soon as TriggerDetectedDuration is exceeded, not at the next full second. The blind period lasts
 * the full BlindDuration, as the specification requires; the camera-app ends it one second early.
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
        this.internal.checkTimer = this.periodicReactorTimer("Zone activity", CHECK_INTERVAL, this.#check);
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
        let activity = activities.get(zoneId);
        if (activity?.blindUntil !== undefined && Time.nowUs >= activity.blindUntil) {
            activities.delete(zoneId);
            activity = undefined;
        }

        if (activity === undefined) {
            this.events.zoneTriggered.emit(
                { zone: zoneId, reason: ZoneManagement.ZoneEventTriggeredReason.Motion },
                this.context,
            );
            activities.set(zoneId, {
                trigger,
                initialTriggerAt: Time.nowUs,
                triggerDetectedDuration: Seconds(trigger.initialDuration),
                previousTriggerDetectedDuration: Seconds(trigger.initialDuration),
                triggerCount: 1,
            });
            const { checkTimer } = this.internal;
            if (!checkTimer?.isRunning) {
                checkTimer?.start();
            }
            return;
        }

        if (activity.blindUntil !== undefined) {
            return;
        }

        activity.triggerCount++;
        if (
            activity.triggerCount <= 2 ||
            timeSinceInitialTrigger(activity) > activity.previousTriggerDetectedDuration
        ) {
            activity.previousTriggerDetectedDuration = activity.triggerDetectedDuration;
            activity.triggerDetectedDuration = Millis(
                activity.triggerDetectedDuration + Seconds(activity.trigger.augmentationDuration),
            );
        }
    }

    #check() {
        const { activities } = this.internal;
        for (const [zoneId, activity] of activities) {
            if (activity.blindUntil !== undefined) {
                if (Time.nowUs >= activity.blindUntil) {
                    activities.delete(zoneId);
                }
                continue;
            }

            const elapsed = timeSinceInitialTrigger(activity);
            if (elapsed > activity.triggerDetectedDuration) {
                this.#stop(zoneId, activity, ZoneManagement.ZoneEventStoppedReason.ActionStopped);
            } else if (elapsed > Seconds(activity.trigger.maxDuration)) {
                this.#stop(zoneId, activity, ZoneManagement.ZoneEventStoppedReason.Timeout);
            }
        }

        if (!activities.size) {
            this.internal.checkTimer?.stop();
        }
    }

    #stop(zoneId: number, activity: ZoneActivity, reason: ZoneManagement.ZoneEventStoppedReason) {
        this.events.zoneStopped.emit({ zone: zoneId, reason }, this.context);
        activity.blindUntil = Timestamp(Time.nowUs + Seconds(activity.trigger.blindDuration));
    }
}

function timeSinceInitialTrigger(activity: ZoneActivity) {
    return Timestamp.delta(activity.initialTriggerAt, Time.nowUs);
}

export namespace TestZoneManagementServer {
    export class Internal {
        checkTimer?: Timer;
        activities = new Map<number, ZoneActivity>();
    }
}
