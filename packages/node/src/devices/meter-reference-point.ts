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
 * A Meter Reference Point device provides details about tariffs and metering.
 *
 * ### Device Type Requirements
 *
 * A Meter Reference Point is composed of other endpoints with device types listed in this table, subject to the
 * conformance column of the table. Additional device types not listed in this table may also be included in device
 * compositions.
 *
 * ### Meter Reference Point Topology
 *
 * #### Basic Electrical Meter Reference Point
 *
 * A basic electrical Meter Reference Point device type has a simple import tariff endpoint for grid power, tagged as
 * Grid, Import, AC, and Current.
 *
 * Optionally, this endpoint may have a child endpoint representing an upcoming tariff, if available, tagged as Grid,
 * Import, AC, and Upcoming.
 *
 * Optionally, the tariff endpoint may have child endpoints representing tariffs for individual phases of a polyphase
 * power supply.
 *
 * #### Separate EV Rate
 *
 * Building on the basic topology, a Meter Reference Point device type which has a separate rate for EV charging would
 * add a second endpoint, tagged as EV, Import, AC, and Current.
 *
 * Optionally, this endpoint may have a child endpoint representing an upcoming EV tariff, if available, tagged as EV,
 * Import, AC, and Upcoming.
 *
 * #### Export Rate
 *
 * Similarly, a Meter Reference Point device type which has a separate rate for exported electrical energy would add a
 * second endpoint, tagged as Grid, Export, AC, and Current.
 *
 * Optionally, this endpoint may have a child endpoint representing an upcoming export tariff, if available, tagged as
 * Grid, Export, AC, and Upcoming.
 *
 * #### Combination of EV and Export
 *
 * The above topologies can be composed to represent various combinations of tariffs. In this example, a tariff has
 * separate rates for an EV and for exporting energy to the grid.
 *
 * #### Inclusion of Metering Data
 *
 * Instead of Electrical Energy Tariff endpoints, a Meter Reference Point may use endpoints with the Electrical Meter
 * device type to represent tariffs with associated metering data.
 *
 * @see {@link MatterSpecification.v16.Device} § 14.6
 */
export interface MeterReferencePointDevice extends Identity<typeof MeterReferencePointDeviceDefinition> {}

export namespace MeterReferencePointRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer } };
}

export const MeterReferencePointDeviceDefinition = MutableEndpoint({
    name: "MeterReferencePoint",
    deviceType: 0x512,
    deviceRevision: 1,
    requirements: MeterReferencePointRequirements,
    behaviors: SupportedBehaviors(MeterReferencePointRequirements.server.mandatory.Identify)
});

Object.freeze(MeterReferencePointDeviceDefinition);
export const MeterReferencePointDevice: MeterReferencePointDevice = MeterReferencePointDeviceDefinition;
