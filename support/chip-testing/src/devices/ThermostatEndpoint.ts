/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { GroupsServer } from "@matter/main/behaviors/groups";
import { ThermostatServer } from "@matter/main/behaviors/thermostat";
import { ThermostatUserInterfaceConfigurationServer } from "@matter/main/behaviors/thermostat-user-interface-configuration";
import { Thermostat, ThermostatUserInterfaceConfiguration } from "@matter/main/clusters";
import { ThermostatDevice } from "@matter/main/devices/thermostat";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

const FullThermostat = ThermostatDevice.with(
    ThermostatServer.with("Heating", "Cooling", "AutoMode", "Presets"),
    GroupsServer,
    ThermostatUserInterfaceConfigurationServer,
);

const presetTypeFeatures = { supportsNames: true };

function builtInPreset(presetScenario: Thermostat.PresetScenario) {
    return {
        presetHandle: Uint8Array.of(presetScenario),
        presetScenario,
        builtIn: true,
        heatingSetpoint: 2000,
        coolingSetpoint: 2600,
    };
}

registerDeviceType({
    name: "thermostat",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(FullThermostat, {
            number: endpoint,
            // Setpoints in 0.01 °C, deadband in 0.1 °C; limits and setpoints are CHIP's thermostat-server defaults
            thermostat: {
                externalMeasuredIndoorTemperature: 2500,
                systemMode: Thermostat.SystemMode.Off,
                controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
                absMinHeatSetpointLimit: 700,
                minHeatSetpointLimit: 700,
                maxHeatSetpointLimit: 3000,
                absMaxHeatSetpointLimit: 3000,
                absMinCoolSetpointLimit: 1600,
                minCoolSetpointLimit: 1600,
                maxCoolSetpointLimit: 3200,
                absMaxCoolSetpointLimit: 3200,
                occupiedHeatingSetpoint: 2000,
                occupiedCoolingSetpoint: 2600,
                minSetpointDeadBand: 20,
                localTemperatureCalibration: 0,
                remoteSensing: {},
                thermostatRunningMode: Thermostat.ThermostatRunningMode.Off,
                thermostatRunningState: {},
                temperatureSetpointHold: Thermostat.TemperatureSetpointHold.SetpointHoldOff,
                temperatureSetpointHoldDuration: null,
                setpointHoldExpiryTimestamp: null,
                presetTypes: [
                    { presetScenario: Thermostat.PresetScenario.Occupied, numberOfPresets: 1, presetTypeFeatures },
                    { presetScenario: Thermostat.PresetScenario.Unoccupied, numberOfPresets: 1, presetTypeFeatures },
                    { presetScenario: Thermostat.PresetScenario.UserDefined, numberOfPresets: 1, presetTypeFeatures },
                ],
                numberOfPresets: 3,
                presets: [
                    builtInPreset(Thermostat.PresetScenario.Occupied),
                    builtInPreset(Thermostat.PresetScenario.Unoccupied),
                ],
                activePresetHandle: null,
            },
            thermostatUserInterfaceConfiguration: {
                scheduleProgrammingVisibility:
                    ThermostatUserInterfaceConfiguration.ScheduleProgrammingVisibility.ScheduleProgrammingPermitted,
            },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
