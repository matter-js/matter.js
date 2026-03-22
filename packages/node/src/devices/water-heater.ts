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
 * WaterHeaterDevice requires Thermostat cluster but Thermostat is not added by default because you must select the
 * features your device supports. You can add manually using WaterHeaterDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 14.2
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
     * A definition for each device type required as a component endpoint per the Matter specification.
     */
    export const deviceTypes = {
        optional: {
            /**
             * The PowerSource device type is optional per the Matter specification.
             */
            PowerSource: { deviceType: 0x11 },

            /**
             * The TemperatureSensor device type is optional per the Matter specification.
             */
            TemperatureSensor: { deviceType: 0x302 },

            /**
             * The DeviceEnergyManagement device type is optional per the Matter specification.
             */
            DeviceEnergyManagement: { deviceType: 0x50d },

            /**
             * The ElectricalSensor device type is optional per the Matter specification.
             */
            ElectricalSensor: { deviceType: 0x510 }
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
        WaterHeaterRequirements.server.mandatory.WaterHeaterMode
    )
});

Object.freeze(WaterHeaterDeviceDefinition);
export const WaterHeaterDevice: WaterHeaterDevice = WaterHeaterDeviceDefinition;
