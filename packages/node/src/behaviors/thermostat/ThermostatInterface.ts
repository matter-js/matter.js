/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { Thermostat } from "#clusters/thermostat";

export namespace ThermostatInterface {
    export interface Base {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 4.3.10.1
         */
        setpointRaiseLower(request: Thermostat.SetpointRaiseLowerRequest): MaybePromise;

        atomicRequest(request: Thermostat.AtomicRequest): MaybePromise<Thermostat.AtomicResponse>;
    }

    export interface ScheduleConfiguration {
        /**
         * This command is used to update the thermostat weekly setpoint schedule from a management system. If the
         * thermostat already has a weekly setpoint schedule programmed, then it SHOULD replace each daily setpoint set
         * as it receives the updates from the management system. For example, if the thermostat has 4 setpoints for
         * every day of the week and is sent a SetWeeklySchedule command with one setpoint for Saturday then the
         * thermostat SHOULD remove all 4 setpoints for Saturday and replace those with the updated setpoint but leave
         * all other days unchanged. If the schedule is larger than what fits in one frame or contains more than 10
         * transitions, the schedule shall then be sent using multiple SetWeeklySchedule Commands.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.3.10.2
         */
        setWeeklySchedule(request: Thermostat.SetWeeklyScheduleRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 4.3.10.3
         */
        getWeeklySchedule(request: Thermostat.GetWeeklyScheduleRequest): MaybePromise<Thermostat.GetWeeklyScheduleResponse>;

        /**
         * This command is used to clear the weekly schedule. The Clear weekly schedule has no payload.
         *
         * Upon receipt, all transitions currently stored shall be cleared and a default response of SUCCESS shall be
         * sent in response. There are no error responses to this command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.3.10.5
         */
        clearWeeklySchedule(): MaybePromise;
    }

    export interface Presets {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 4.3.10.9
         */
        setActivePresetRequest(request: Thermostat.SetActivePresetRequest): MaybePromise;
    }

    export interface MatterScheduleConfiguration {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 4.3.10.8
         */
        setActiveScheduleRequest(request: Thermostat.SetActiveScheduleRequest): MaybePromise;
    }
}

export type ThermostatInterface = {
    components: [
        { flags: {}, methods: ThermostatInterface.Base },
        { flags: { scheduleConfiguration: true }, methods: ThermostatInterface.ScheduleConfiguration },
        { flags: { presets: true }, methods: ThermostatInterface.Presets },
        { flags: { matterScheduleConfiguration: true }, methods: ThermostatInterface.MatterScheduleConfiguration }
    ]
};
