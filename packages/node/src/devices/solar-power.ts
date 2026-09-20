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
 * ### Solar Power Architecture
 *
 * A Solar Power device is always defined via endpoint composition. See Section 14.3.6, "Device Type Requirements" for
 * more details.
 *
 * An example of a Solar Power device with single phase AC output is illustrated below.
 *
 * An example of a Solar Power device with single phase AC output, but with the ability to measure the output from 4
 * sets of solar panels supplying the overall device is illustrated below.
 *
 * An example of a Solar Power device with single phase AC output, but with the ability to measure the output from 4
 * individual solar panels, arranged as 2 strings or 2 panels each is illustrated below.
 *
 * ### Device Type Requirements
 *
 * A Solar Power device shall be composed of at least one endpoint with device types as defined by the conformance
 * below. There may be more endpoints with additional instances of these device types or additional device types
 * existing in the Solar Power device.
 *
 * #### Device Energy Management Device Type
 *
 * If the Solar Power device output power can be controlled, then the Device Energy Management device shall be included.
 *
 * #### Cluster Requirements on Component Device Types
 *
 * If a Solar Power device supports measurement of the output of individual solar panels or strings of solar panels then
 * it may include additional endpoints for each such measurement, including an Electrical Sensor Device Type as child
 * elements. For each such child endpoint:
 *
 *   - It shall include a User Label cluster to allow an installer to add identifying information for the panel or
 *     string of panels.
 *
 * #### Element Requirements on Component Device Types
 *
 * The Electrical Sensor device shall also conform to the following:
 *
 *   - An Electrical Sensor device shall measure the energy and power flows of the Solar Power device at the AC grid or
 *     DC connection point.
 *
 *   - If the Solar Power device is connected to AC wiring, this Electrical Power Measurement cluster shall support the
 *     AlternatingCurrent feature, and shall support the PolyPhasePower feature if the Solar Power device is connected
 *     via polyphase wiring.
 *
 *   - If the Solar Power device is connected to DC wiring, this Electrical Power Measurement cluster shall support the
 *     DirectCurrent feature.
 *
 *   - This Electrical Power Measurement cluster SHOULD support the ReactivePower attribute if connected to AC wiring.
 *
 *   - This Electrical Energy Measurement cluster SHOULD support the CumulativeEnergy feature.
 *
 * #### Semantic Tag Requirements on Component Device Types
 *
 * The Descriptor cluster for the endpoint including the Power Source device shall include the Grid tag if it is
 * connected to the premises wiring.
 *
 * If a Solar Power device supports two or three phase power output then it may include two or three additional
 * endpoints, each including an Electrical Sensor Device Type as child elements. For each such child endpoint it shall
 * include a semantic tag from the Electrical Measurement Namespace in the TagList attribute of the Descriptor cluster
 * to describe the endpoint for the relevant Electrical Power Measurement and Electrical Energy Measurement clusters
 * indicating the relevant AC phase that is being measured.
 *
 * If a Solar Power device supports measurement of the output of individual solar panels or strings of solar panels then
 * it may include additional endpoints for each such measurement, including an Electrical Sensor Device Type as child
 * elements. For each such child endpoint:
 *
 *   - It shall include a semantic tag from a Common Namespace, or a Manufacturer defined Tag and Label, in the TagList
 *     attribute of the Descriptor cluster to describe the endpoint for the relevant Electrical Power Measurement and
 *     Electrical Energy Measurement clusters, indicating the relevant device port, panel, or string of panels that is
 *     being measured.
 *
 * Any Temperature Sensors included shall include Tag(s), and for non-standard Namespaces, Label(s) in the Descriptor
 * clusters of their endpoints to identify the temperature being measured.
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
