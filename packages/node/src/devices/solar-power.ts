/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Solar Power device is a device that allows a solar panel array, which can optionally be comprised of a set parallel
 * strings of solar panels, and its associated controller and, if appropriate, inverter, to be monitored and controlled
 * by an Energy Management System.
 *
 * @see {@link MatterSpecification.v16.Device} § 14.3
 */
export interface SolarPowerDevice extends Identity<typeof SolarPowerDeviceDefinition> {}

export namespace SolarPowerRequirements {
    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { optional: { Identify: IdentifyServer } };

    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = {
        mandatory: {
            PowerSource: {
                deviceType: 0x11,
                constraint: "min 1",

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

            ElectricalSensor: {
                deviceType: 0x510,
                constraint: "min 1",

                requires: [
                    { element: "serverCluster", name: "UserLabel", id: 0x41, conformance: "desc" },

                    {
                        element: "serverCluster",
                        name: "ElectricalPowerMeasurement",
                        id: 0x90,
                        requires: [
                            { element: "attribute", name: "Voltage" },
                            { element: "attribute", name: "ActiveCurrent" }
                        ]
                    },

                    {
                        element: "serverCluster",
                        name: "ElectricalEnergyMeasurement",
                        id: 0x91,
                        requires: [{ element: "feature", name: "EXPORTEDENERGY" }]
                    }
                ]
            }
        },

        optional: {
            TemperatureSensor: {
                deviceType: 0x302,

                requires: [{
                    element: "serverCluster",
                    name: "Descriptor",
                    id: 0x1d,
                    requires: [{ element: "feature", name: "TAGLIST" }]
                }]
            },

            DeviceEnergyManagement: {
                deviceType: 0x50d,
                conformance: "desc",

                requires: [{
                    element: "serverCluster",
                    name: "DeviceEnergyManagement",
                    id: 0x98,
                    requires: [{ element: "feature", name: "POWERADJUSTMENT" }]
                }]
            }
        }
    };
}

export const SolarPowerDeviceDefinition = MutableEndpoint({
    name: "SolarPower",
    deviceType: 0x17,
    deviceRevision: 1,
    requirements: SolarPowerRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(SolarPowerDeviceDefinition);
export const SolarPowerDevice: SolarPowerDevice = SolarPowerDeviceDefinition;
