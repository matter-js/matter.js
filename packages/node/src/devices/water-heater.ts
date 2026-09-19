/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    WaterHeaterManagementServer as BaseWaterHeaterManagementServer
} from "../behaviors/water-heater-management/WaterHeaterManagementServer.js";
import {
    WaterHeaterModeServer as BaseWaterHeaterModeServer
} from "../behaviors/water-heater-mode/WaterHeaterModeServer.js";
import { ThermostatServer as BaseThermostatServer } from "../behaviors/thermostat/ThermostatServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A water heater is a device that is generally installed in properties to heat water for showers, baths etc.
 *
 * @see {@link MatterSpecification.v16.Device} § 14.2
 */
export interface WaterHeaterDevice extends Identity<typeof WaterHeaterDeviceDefinition> {}

export namespace WaterHeaterRequirements {
    /**
     * The WaterHeaterManagement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WaterHeaterManagementServer} for convenience.
     */
    export const WaterHeaterManagementServer = BaseWaterHeaterManagementServer;

    /**
     * The WaterHeaterMode cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WaterHeaterModeServer} for convenience.
     */
    export const WaterHeaterModeServer = BaseWaterHeaterModeServer;

    /**
     * The Thermostat cluster is required by the Matter specification.
     *
     * This version of {@link ThermostatServer} is specialized per the specification.
     */
    export const ThermostatServer = BaseThermostatServer.with("Heating");

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            WaterHeaterManagement: WaterHeaterManagementServer,
            WaterHeaterMode: WaterHeaterModeServer,
            Thermostat: ThermostatServer
        },
        optional: { Identify: IdentifyServer }
    };

    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = {
        optional: {
            PowerSource: { deviceType: 0x11 },
            TemperatureSensor: { deviceType: 0x302 },

            DeviceEnergyManagement: {
                deviceType: 0x50d,

                requires: [{
                    element: "serverCluster",
                    name: "DeviceEnergyManagement",
                    id: 0x98,
                    requires: [{ element: "feature", name: "POWERFORECASTREPORTING" }]
                }]
            },

            ElectricalSensor: {
                deviceType: 0x510,
                conformance: "desc",
                requires: [
                    { element: "serverCluster", name: "ElectricalPowerMeasurement", id: 0x90 },
                    { element: "serverCluster", name: "ElectricalEnergyMeasurement", id: 0x91 }
                ]
            }
        }
    };
}

export const WaterHeaterDeviceDefinition = MutableEndpoint({
    name: "WaterHeater",
    deviceType: 0x50f,
    deviceRevision: 1,
    requirements: WaterHeaterRequirements,
    behaviors: SupportedBehaviors(
        WaterHeaterRequirements.server.mandatory.WaterHeaterManagement,
        WaterHeaterRequirements.server.mandatory.WaterHeaterMode,
        WaterHeaterRequirements.server.mandatory.Thermostat
    )
});

Object.freeze(WaterHeaterDeviceDefinition);
export const WaterHeaterDevice: WaterHeaterDevice = WaterHeaterDeviceDefinition;
