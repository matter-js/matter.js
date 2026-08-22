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

export const PresetsThermostatServer = ThermostatServer.with("Heating", "Cooling", "AutoMode", "Presets");

export const PresetsThermostat = ThermostatDevice.with(PresetsThermostatServer);

export const PRESETS_ATTRIBUTE = Thermostat.attributes.presets.id;

/**
 * A preset the device has not seen before.  This is a factory because a write normalizes the presets it is given in
 * place, so a shared object would carry a generated handle into the next test.
 */
export function newPreset(overrides: Partial<Thermostat.Preset> = {}): Thermostat.Preset {
    return {
        presetHandle: null,
        presetScenario: Thermostat.PresetScenario.Occupied,
        coolingSetpoint: 2600,
        heatingSetpoint: 2000,
        builtIn: false,
        ...overrides,
    };
}

export function thermostatConfig(numberOfPresets = 5, presets: Thermostat.Preset[] = []) {
    return {
        controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
        systemMode: Thermostat.SystemMode.Auto,
        occupiedHeatingSetpoint: 2000,
        occupiedCoolingSetpoint: 2600,
        minSetpointDeadBand: 25,
        numberOfPresets,
        presetTypes: [
            {
                presetScenario: Thermostat.PresetScenario.Occupied,
                numberOfPresets,

                // SupportsNames is absent, so a preset carrying "name" is refused
                presetTypeFeatures: {},
            },
        ],
        activePresetHandle: null,
        presets,
    };
}

export function presetsEndpoint(numberOfPresets?: number, presets?: Thermostat.Preset[]) {
    return new Endpoint(PresetsThermostat, {
        id: "thermostat",
        number: 1,
        thermostat: thermostatConfig(numberOfPresets, presets),
    });
}

/**
 * Records the attribute IDs the device announces as changed for the thermostat cluster.  This is the only input a
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
