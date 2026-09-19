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
 * A Battery Storage device is a device that allows a DC battery, which can optionally be comprised of a set parallel
 * strings of battery packs and associated controller, and an AC inverter, to be monitored and controlled by an Energy
 * Management System in order to manage the peaks and troughs of supply and demand, and/or to optimize cost of the
 * energy consumed in premises. It is not intended to be used for a UPS directly supplying a set of appliances, nor for
 * portable battery storage devices.
 *
 * @see {@link MatterSpecification.v16.Device} § 14.4
 */
export interface BatteryStorageDevice extends Identity<typeof BatteryStorageDeviceDefinition> {}

export namespace BatteryStorageRequirements {
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
            ElectricalSensor1: {
                deviceType: 0x510,
                constraint: "min 2",

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

                    {
                        element: "serverCluster",
                        name: "ElectricalEnergyMeasurement",
                        id: 0x91,
                        requires: [{ element: "feature", name: "EXPORTEDENERGY" }]
                    },

                    {
                        element: "serverCluster",
                        name: "Descriptor",
                        id: 0x1d,
                        requires: [{ element: "feature", name: "TAGLIST" }]
                    }
                ]
            },

            ElectricalSensor2: {
                deviceType: 0x510,
                constraint: "min 2",

                requires: [
                    {
                        element: "serverCluster",
                        name: "ElectricalPowerMeasurement",
                        id: 0x90,
                        requires: [
                            { element: "feature", name: "DIRECTCURRENT" },
                            { element: "attribute", name: "Voltage" },
                            { element: "attribute", name: "ActiveCurrent" }
                        ]
                    },

                    {
                        element: "serverCluster",
                        name: "ElectricalEnergyMeasurement",
                        id: 0x91,
                        requires: [{ element: "feature", name: "EXPORTEDENERGY" }]
                    },

                    {
                        element: "serverCluster",
                        name: "Descriptor",
                        id: 0x1d,
                        requires: [{ element: "feature", name: "TAGLIST" }]
                    }
                ]
            },

            PowerSource1: {
                deviceType: 0x11,
                constraint: "min 2",

                requires: [
                    {
                        element: "serverCluster",
                        name: "Descriptor",
                        id: 0x1d,
                        requires: [{ element: "feature", name: "TAGLIST" }]
                    },

                    {
                        element: "serverCluster",
                        name: "PowerSource",
                        id: 0x2f,
                        requires: [{ element: "feature", name: "WIRED" }]
                    }
                ]
            },

            PowerSource2: {
                deviceType: 0x11,
                constraint: "min 2",

                requires: [
                    {
                        element: "serverCluster",
                        name: "Descriptor",
                        id: 0x1d,
                        requires: [{ element: "feature", name: "TAGLIST" }]
                    },

                    {
                        element: "serverCluster",
                        name: "PowerSource",
                        id: 0x2f,

                        requires: [
                            { element: "feature", name: "BATTERY" },
                            { element: "attribute", name: "BatVoltage" },
                            { element: "attribute", name: "BatPercentRemaining" },
                            { element: "attribute", name: "BatTimeRemaining" },
                            { element: "attribute", name: "ActiveBatFaults" },
                            { element: "attribute", name: "BatCapacity" },
                            { element: "attribute", name: "BatTimeToFullCharge" },
                            { element: "attribute", name: "BatChargingCurrent" },
                            { element: "attribute", name: "ActiveBatChargeFaults" }
                        ]
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
            }
        },

        optional: {
            SolarPower: { deviceType: 0x17 },

            TemperatureSensor: {
                deviceType: 0x302,

                requires: [{
                    element: "serverCluster",
                    name: "Descriptor",
                    id: 0x1d,
                    requires: [{ element: "feature", name: "TAGLIST" }]
                }]
            }
        }
    };
}

export const BatteryStorageDeviceDefinition = MutableEndpoint({
    name: "BatteryStorage",
    deviceType: 0x18,
    deviceRevision: 2,
    requirements: BatteryStorageRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(BatteryStorageDeviceDefinition);
export const BatteryStorageDevice: BatteryStorageDevice = BatteryStorageDeviceDefinition;
