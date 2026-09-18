/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatServer } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { ServerNode } from "#node/ServerNode.js";
import { AttributeId } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";

export const SchedulesThermostatServer = ThermostatServer.with(
    "Heating",
    "Cooling",
    "AutoMode",
    "Presets",
    "MatterScheduleConfiguration",
);

export const SchedulesThermostat = ThermostatDevice.with(SchedulesThermostatServer);

export const SCHEDULES_ATTRIBUTE = Thermostat.attributes.schedules.id;

/**
 * A transition the caller has not seen before. Callers only ever add setpoints or a presetHandle, never both, so
 * this stays setpoint-based like the ScheduleTypeFeatures used by {@link thermostatConfig}.
 */
export function newScheduleTransition(
    overrides: Partial<Thermostat.ScheduleTransition> = {},
): Thermostat.ScheduleTransition {
    return {
        dayOfWeek: { monday: true },
        transitionTime: 360,
        heatingSetpoint: 2000,
        coolingSetpoint: 2600,
        ...overrides,
    };
}

/**
 * A schedule the device has not seen before. This is a factory because a write normalizes the schedules it is given
 * in place, so a shared object would carry a generated handle into the next test.
 */
export function newSchedule(overrides: Partial<Thermostat.Schedule> = {}): Thermostat.Schedule {
    return {
        scheduleHandle: null,
        systemMode: Thermostat.SystemMode.Auto,
        transitions: [newScheduleTransition()],
        builtIn: false,
        ...overrides,
    };
}

export function thermostatConfig(numberOfSchedules = 5, schedules: Thermostat.Schedule[] = []) {
    return {
        controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
        systemMode: Thermostat.SystemMode.Auto,
        occupiedHeatingSetpoint: 2000,
        occupiedCoolingSetpoint: 2600,
        minSetpointDeadBand: 25,
        numberOfPresets: 5,
        presetTypes: [
            {
                presetScenario: Thermostat.PresetScenario.Occupied,
                numberOfPresets: 5,
                presetTypeFeatures: {},
            },
        ],
        activePresetHandle: null,
        presets: [],
        numberOfSchedules,
        numberOfScheduleTransitions: 10,
        numberOfScheduleTransitionPerDay: null,
        scheduleTypes: [
            {
                systemMode: Thermostat.SystemMode.Auto,
                numberOfSchedules,

                // SupportsNames and SupportsOff are absent, so a schedule carrying "name" or transitioning to Off is
                // refused; SupportsSetpoints is set so transitions may carry setpoints directly
                scheduleTypeFeatures: { supportsPresets: true, supportsSetpoints: true },
            },
        ],
        activeScheduleHandle: null,
        schedules,
    };
}

export function schedulesEndpoint(numberOfSchedules?: number, schedules?: Thermostat.Schedule[]) {
    return new Endpoint(SchedulesThermostat, {
        id: "thermostat",
        number: 1,
        thermostat: thermostatConfig(numberOfSchedules, schedules),
    });
}

/**
 * An endpoint that selects the MatterScheduleConfiguration feature but leaves the attribute's value to the cluster,
 * which is the configuration the attribute must work in without the application knowing anything about schedules.
 */
export function unconfiguredSchedulesEndpoint() {
    const { schedules, ...thermostat } = thermostatConfig();
    void schedules;
    return new Endpoint(SchedulesThermostat, { id: "thermostat", number: 1, thermostat });
}

/**
 * Records the attribute IDs the device announces as changed for the thermostat cluster. This is the only input a
 * server subscription has for attribute reports, so it decides what a subscribed controller learns.
 */
export function recordThermostatChanges(device: ServerNode) {
    const announcements = new Array<AttributeId[]>();
    device.protocol.attrsChanged.on((_endpointId, clusterId, attrs) => {
        if (clusterId === Thermostat.id) {
            announcements.push([...attrs]);
        }
    });
    return announcements;
}
