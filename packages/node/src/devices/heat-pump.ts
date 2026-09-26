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
 * ### Heat Pump Architecture
 *
 * A Heat Pump device is always defined via endpoint composition. See Section 14.5.6, "Device Type Requirements" for
 * more details.
 *
 * The Heat Pump device may contain Temperature Sensors for example to measure the flow and return temperatures of the
 * water it is providing to the premises heating system.
 *
 * The Heat Pump device may also include Thermostats located in the rooms that are being heated by it, which in turn may
 * also include Temperature Sensor clusters which can report the temperatures in those rooms. These Thermostats may be
 * included as servers within Thermostat devices within the Heat Pump device itself, or may be separate third-party
 * Thermostat devices for which the Heat Pump has a client to use them.
 *
 * An example of a Heat Pump device is illustrated below.
 *
 * ### Device Type Requirements
 *
 * A Heat Pump device shall be composed of at least one endpoint with device types as defined by the conformance below.
 * There may be more endpoints with additional instances of these device types or additional device types existing in
 * the Heat Pump device.
 *
 * The Heat Pump device shall include either one or more Thermostat devices, or include a Thermostat client.
 *
 * #### Element Requirements on Component Device Types
 *
 * If a Heat Pump device supports two or three phase power input then it may include two or three additional endpoints,
 * each including an Electrical Sensor Device Type as child elements. For each such child endpoint it shall include a
 * semantic tag from the Electrical Measurement Namespace in the TagList attribute of the Descriptor cluster to describe
 * the endpoint for the relevant Electrical Power Measurement and Electrical Energy Measurement clusters indicating the
 * relevant AC phase that is being measured.
 *
 * The Electrical Energy Measurement and Electrical Power Measurement clusters of the mandatory Electrical Sensor device
 * shall measure the energy and power of the Heat Pump device at the AC grid connection point.
 *
 * The Electrical Power Measurement clusters of the mandatory Electrical Sensor device shall support the PolyPhasePower
 * feature if the Heat Pump device is connected via polyphase wiring.
 *
 * The Electrical Energy Measurement cluster of the mandatory Electrical Sensor device SHOULD support the ImportedEnergy
 * and CumulativeEnergy features.
 *
 * Any Temperature Sensors using non-standard Namespaces for their Tags shall include Label(s) in the Descriptor
 * clusters of their endpoints to identify the temperature being measured.
 *
 * Any Thermostat shall include a semantic tag from a Common Namespace, or a Manufacturer defined Tag and Label, in the
 * TagList attribute of the Descriptor cluster to describe the endpoint for the relevant Thermostat clusters, indicating
 * the relevant device (or its connected port) that is being measured. It shall also include a User Label cluster to
 * allow an installer to add identifying information for the rooms or spaces where the Thermostat measurement point is
 * located.
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
