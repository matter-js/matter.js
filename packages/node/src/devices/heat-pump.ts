/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { ThermostatBehavior as BaseThermostatBehavior } from "../behaviors/thermostat/ThermostatBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Heat Pump device is a device that uses electrical energy to heat either spaces or water tanks using ground, water
 * or air as the heat source. These typically can heat the air or can pump water via central heating radiators or
 * underfloor heating systems. It is typical to also heat hot water and store the heat in a hot water tank.
 *
 * Note that the Water Heater device type can also be heated by a heat pump and has similar requirements, but that
 * cannot be used for space heating.
 *
 * @see {@link MatterSpecification.v142.Device} § 14.5
 */
export interface HeatPumpDevice extends Identity<typeof HeatPumpDeviceDefinition> {}

export namespace HeatPumpRequirements {
    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The Thermostat cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThermostatBehavior} for convenience.
     */
    export const ThermostatBehavior = BaseThermostatBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { optional: { Identify: IdentifyServer }, mandatory: {} };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = { optional: { Thermostat: ThermostatBehavior }, mandatory: {} };
}

export const HeatPumpDeviceDefinition = MutableEndpoint({
    name: "HeatPump",
    deviceType: 0x309,
    deviceRevision: 1,
    requirements: HeatPumpRequirements,
    behaviors: SupportedBehaviors()
});

export const HeatPumpDevice: HeatPumpDevice = HeatPumpDeviceDefinition;
