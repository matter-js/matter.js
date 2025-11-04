/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThermostatServer as BaseThermostatServer } from "../behaviors/thermostat/ThermostatServer.js";
import {
    WaterHeaterManagementServer as BaseWaterHeaterManagementServer
} from "../behaviors/water-heater-management/WaterHeaterManagementServer.js";
import {
    WaterHeaterModeServer as BaseWaterHeaterModeServer
} from "../behaviors/water-heater-mode/WaterHeaterModeServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

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
     * The Thermostat cluster is required by the Matter specification.
     *
     * This version of {@link ThermostatServer} is specialized per the specification.
     */
    export const ThermostatServer = BaseThermostatServer.with("Heating");

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
            Thermostat: ThermostatServer,
            WaterHeaterManagement: WaterHeaterManagementServer,
            WaterHeaterMode: WaterHeaterModeServer
        },
        optional: { Identify: IdentifyServer }
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
