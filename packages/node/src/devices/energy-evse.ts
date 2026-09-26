/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { EnergyEvseServer as BaseEnergyEvseServer } from "../behaviors/energy-evse/EnergyEvseServer.js";
import { EnergyEvseModeServer as BaseEnergyEvseModeServer } from "../behaviors/energy-evse-mode/EnergyEvseModeServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    TemperatureMeasurementServer as BaseTemperatureMeasurementServer
} from "../behaviors/temperature-measurement/TemperatureMeasurementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * An EVSE (Electric Vehicle Supply Equipment) is a device that allows an EV (Electric Vehicle) to be connected to the
 * mains electricity supply to allow it to be charged (or discharged in case of Vehicle to Grid / Vehicle to Home
 * applications).
 *
 * ### EVSE Architecture
 *
 * An EVSE is always defined via endpoint composition. See Section 14.1.6, "Device Type Requirements" for more details.
 *
 * An example of an EVSE with single phase AC supply is illustrated below.
 *
 * The EVSE may also indicate its internal temperature using the temperature measurement cluster (not shown).
 *
 * An example of an EVSE with a 3 phase AC supply is illustrated below.
 *
 * ### Device Type Requirements
 *
 * An EVSE shall be composed of at least one endpoint with device types as defined by the conformance below. There may
 * be more endpoints with other device types existing in the EVSE.
 *
 * #### Cluster Requirements on Component Device Types
 *
 * The Electrical Sensor device shall include both the Electrical Energy Measurement and Electrical Power Measurement
 * clusters, measuring the total energy and power of the EVSE.
 *
 * #### Element Requirements on Component Device Types
 *
 * If an EVSE supports three phase power then it shall include three additional endpoints including an Electrical Sensor
 * Device Type as child elements. For each child endpoint it shall include a semantic tag from the Electrical
 * Measurement Namespace in the TagList attribute of the Descriptor cluster to describe the endpoint for the relevant
 * Electrical Power Measurement and Electrical Energy Measurement clusters indicating the relevant AC phase that is
 * being measured.
 *
 * If the EVSE supports the V2X feature then the Device Energy Management cluster included in the Device Energy
 * Management device shall support the PowerAdjustment (PA) feature.
 *
 * @see {@link MatterSpecification.v16.Device} § 14.1
 */
export interface EnergyEvseDevice extends Identity<typeof EnergyEvseDeviceDefinition> {}

export namespace EnergyEvseRequirements {
    /**
     * The EnergyEvse cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link EnergyEvseServer} for convenience.
     */
    export const EnergyEvseServer = BaseEnergyEvseServer;

    /**
     * The EnergyEvseMode cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link EnergyEvseModeServer} for convenience.
     */
    export const EnergyEvseModeServer = BaseEnergyEvseModeServer;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementServer} for convenience.
     */
    export const TemperatureMeasurementServer = BaseTemperatureMeasurementServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { EnergyEvse: EnergyEvseServer, EnergyEvseMode: EnergyEvseModeServer },
        optional: { Identify: IdentifyServer, TemperatureMeasurement: TemperatureMeasurementServer }
    };
}

export const EnergyEvseDeviceDefinition = MutableEndpoint({
    name: "EnergyEvse",
    deviceType: 0x50c,
    deviceRevision: 2,
    requirements: EnergyEvseRequirements,
    behaviors: SupportedBehaviors(
        EnergyEvseRequirements.server.mandatory.EnergyEvse,
        EnergyEvseRequirements.server.mandatory.EnergyEvseMode
    )
});

Object.freeze(EnergyEvseDeviceDefinition);
export const EnergyEvseDevice: EnergyEvseDevice = EnergyEvseDeviceDefinition;
