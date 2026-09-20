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
 * ### Battery Storage Architecture
 *
 * A Battery Storage device is always defined via endpoint composition. See Section 14.4.6, "Device Type Requirements"
 * for more details.
 *
 * An example of a Battery Storage device with single phase AC output is illustrated below.
 *
 * An example of a Battery Storage device which also includes a directly connected Solar Power device supplying DC power
 * to the battery and using a single common inverter to the single phase AC input and output is illustrated below.
 *
 * ### Device Type Requirements
 *
 * A Battery Storage device shall be composed of at least two endpoints with device types as defined by the conformance
 * below. There may be more endpoints with additional instances of these device types or additional device types
 * existing in the Battery Storage device.
 *
 * The Solar Power devices, if included, shall have separate endpoints, and include their own Power Source, Electrical
 * Sensor, and Device Energy Management devices, as defined by the Solar Power device.
 *
 * #### Cluster Requirements on Component Device Types
 *
 * > [!NOTE]
 *
 * > NOTE: The use of 1st and 2nd to annotate the device types is purely to distinguish the two from each other. It does
 *   NOT specify any order or structure of the composition.
 *
 * #### Element Requirements on Component Device Types
 *
 * The Power Source cluster in the Power Source device shall support the RECHG feature if it can be charged as well as
 * discharged through the connection to the premises wiring.
 *
 * The Electrical Sensor device shall also conform to the following:
 *
 *   - An Electrical Sensor device shall measure the energy and power flows of the Battery Storage device at the AC grid
 *     connection point.
 *
 *   - The Electrical Power Measurement cluster of this Electrical Sensor device shall support the PolyphasePower
 *     feature if the Battery Storage device is connected via polyphase wiring, and SHOULD support the ReactivePower
 *     attribute.
 *
 *   - The Electrical Energy Measurement cluster of this Electrical Sensor device shall support the ImportedEnergy
 *     feature if it can be charged as well as discharged through the connection to the premises wiring, and SHOULD
 *     support the CumulativeEnergy feature.
 *
 * If a Battery Storage device supports two or three phase power output then it may include two or three additional
 * endpoints, each including an Electrical Sensor Device Type as child elements. For each such child endpoint it shall
 * include a semantic tag from the Electrical Measurement Namespace in the TagList attribute of the Descriptor cluster
 * to describe the endpoint for the relevant Electrical Power Measurement and Electrical Energy Measurement clusters
 * indicating the relevant AC phase that is being measured.
 *
 * If a Battery Storage device supports measurement of the input and output of individual batteries or sets of batteries
 * then it may include additional endpoints for each such measurement, including an Electrical Sensor Device Type as
 * child elements. For each such child endpoint: it shall include a semantic tag from the Common Number Namespace, or a
 * Manufacturer defined Tag and Label, in the TagList attribute of the Descriptor cluster to describe the endpoint for
 * the relevant Electrical Power Measurement and Electrical Energy Measurement clusters indicating the relevant device
 * port, battery, or set of batteries that is being measured. it SHOULD also include a User Label cluster to allow an
 * installer to add identifying information if the device permits flexible connection of the actual batteries at
 * installation time.
 *
 * Any Temperature Sensors included shall include Tag(s), and for non-standard Namespaces, Label(s) in the Descriptor
 * clusters of their endpoints to identify the temperature being measured.
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
