/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Thermostat } from "@matter/main/clusters";

const everyDay = {
    sunday: true,
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
};

/**
 * MatterScheduleConfiguration state of CHIP's thermostat example: room for one schedule per Heat and Cool type but one
 * schedule in total, so TC_TSTAT_4_5 reaches RESOURCE_EXHAUSTED, and one stored built-in Heat schedule.
 */
export function thermostatScheduleState() {
    return {
        scheduleTypes: [
            {
                systemMode: Thermostat.SystemMode.Heat,
                numberOfSchedules: 1,
                scheduleTypeFeatures: { supportsSetpoints: true },
            },
            {
                systemMode: Thermostat.SystemMode.Cool,
                numberOfSchedules: 1,
                scheduleTypeFeatures: { supportsSetpoints: true },
            },
        ],
        numberOfSchedules: 1,
        numberOfScheduleTransitions: 10,
        numberOfScheduleTransitionPerDay: 4,
        activeScheduleHandle: null,
        schedules: [
            {
                scheduleHandle: Uint8Array.of(Thermostat.SystemMode.Heat),
                systemMode: Thermostat.SystemMode.Heat,
                transitions: [
                    { dayOfWeek: everyDay, transitionTime: 6 * 60, heatingSetpoint: 2100 },
                    { dayOfWeek: everyDay, transitionTime: 22 * 60, heatingSetpoint: 1800 },
                ],
                builtIn: true,
            },
        ],
    };
}
