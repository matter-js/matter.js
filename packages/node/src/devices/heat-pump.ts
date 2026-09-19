/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { ThermostatClient as BaseThermostatClient } from "../behaviors/thermostat/ThermostatClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Heat Pump device is a device that uses electrical energy to heat either spaces or water tanks using ground, water
 * or air as the heat source. These typically can heat the air or can pump water via central heating radiators or
 * underfloor heating systems. It is typical to also heat hot water and store the heat in a hot water tank.
 *
 * Note that the Water Heater device type can also be heated by a heat pump and has similar requirements, but that
 * cannot be used for space heating.
 *
 * @see {@link MatterSpecification.v16.Device} § 14.5
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
     * We provide this alias to the default implementation {@link ThermostatClient} for convenience.
     */
    export const ThermostatClient = BaseThermostatClient;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { optional: { Identify: IdentifyServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = { optional: { Thermostat: ThermostatClient } };

    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = {
        mandatory: {
            PowerSource: {
                deviceType: 0x11,

                requires: [
                    {
                        element: "serverCluster",
                        name: "PowerSource",
                        id: 0x2f,
                        requires: [{ element: "feature", name: "WIRED" }]
                    },

                    {
                        element: "serverCluster",
                        name: "Descriptor",
                        id: 0x1d,
                        requires: [{ element: "feature", name: "TAGLIST" }]
                    }
                ]
            },

            DeviceEnergyManagement: {
                deviceType: 0x50d,

                requires: [{
                    element: "serverCluster",
                    name: "DeviceEnergyManagement",
                    id: 0x98,
                    requires: [{ element: "feature", name: "POWERADJUSTMENT" }]
                }]
            },

            ElectricalSensor: {
                deviceType: 0x510,
                constraint: "min 1",

                requires: [
                    {
                        element: "serverCluster",
                        name: "ElectricalPowerMeasurement",
                        id: 0x90,
                        requires: [
                            { element: "feature", name: "ALTERNATINGCURRENT" },
                            { element: "attribute", name: "Voltage" },
                            { element: "attribute", name: "ActiveCurrent" }
                        ]
                    },

                    { element: "serverCluster", name: "ElectricalEnergyMeasurement", id: 0x91 }
                ]
            }
        },

        optional: {
            Thermostat: {
                deviceType: 0x301,

                requires: [
                    { element: "serverCluster", name: "UserLabel", id: 0x41 },

                    {
                        element: "serverCluster",
                        name: "Descriptor",
                        id: 0x1d,
                        requires: [{ element: "feature", name: "TAGLIST" }]
                    }
                ]
            },

            TemperatureSensor: {
                deviceType: 0x302,

                requires: [{
                    element: "serverCluster",
                    name: "Descriptor",
                    id: 0x1d,
                    requires: [{ element: "feature", name: "TAGLIST" }]
                }]
            },

            WaterHeater: { deviceType: 0x50f }
        }
    };
}

export const HeatPumpDeviceDefinition = MutableEndpoint({
    name: "HeatPump",
    deviceType: 0x309,
    deviceRevision: 1,
    requirements: HeatPumpRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(HeatPumpDeviceDefinition);
export const HeatPumpDevice: HeatPumpDevice = HeatPumpDeviceDefinition;
