/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    MeterIdentificationServer as BaseMeterIdentificationServer
} from "../behaviors/meter-identification/MeterIdentificationServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * An Electrical Utility Meter device provides utility account information, as well as optional details about tariffs
 * and metering.
 *
 * ### Electrical Utility Meter Topology
 *
 * #### Basic Utility Meter
 *
 * A basic Electrical Utility Meter device type has a simple import tariff endpoint for grid power, tagged as Grid,
 * Import, AC, and Current.
 *
 * Optionally, this endpoint may have a child endpoint representing an upcoming tariff, if available, tagged as Grid,
 * Import, AC, and Upcoming.
 *
 * Optionally, this endpoint may have child endpoints representing measurements of individual phases of a polyphase
 * power supply.
 *
 * #### Separate EV Rate
 *
 * Building on the basic topology, an Electrical Utility Meter device type which has a separate rate for EV charging
 * would add a second endpoint, tagged as EV, Import, AC, and Current.
 *
 * Optionally, this endpoint may have a child endpoint representing an upcoming EV tariff, if available, tagged as EV,
 * Import, AC, and Upcoming.
 *
 * #### Export Rate
 *
 * Similarly, an Electrical Utility Meter device type which has a separate rate for exported electrical energy would add
 * a second endpoint, tagged as Grid, Export, AC, and Current.
 *
 * Optionally, this endpoint may have a child endpoint representing an upcoming export tariff, if available, tagged as
 * Grid, Export, AC, and Upcoming.
 *
 * #### Combination of EV and Export
 *
 * The above topologies can be composed to represent various combinations of tariffs. In this example, a tariff has
 * separate rates for an EV and for exporting energy to the grid.
 *
 * @see {@link MatterSpecification.v16.Device} § 14.9
 */
export interface ElectricalUtilityMeterDevice extends Identity<typeof ElectricalUtilityMeterDeviceDefinition> {}

export namespace ElectricalUtilityMeterRequirements {
    /**
     * The MeterIdentification cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link MeterIdentificationServer} for convenience.
     */
    export const MeterIdentificationServer = BaseMeterIdentificationServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { MeterIdentification: MeterIdentificationServer } };
}

export const ElectricalUtilityMeterDeviceDefinition = MutableEndpoint({
    name: "ElectricalUtilityMeter",
    deviceType: 0x511,
    deviceRevision: 1,
    requirements: ElectricalUtilityMeterRequirements,
    behaviors: SupportedBehaviors(ElectricalUtilityMeterRequirements.server.mandatory.MeterIdentification)
});

Object.freeze(ElectricalUtilityMeterDeviceDefinition);
export const ElectricalUtilityMeterDevice: ElectricalUtilityMeterDevice = ElectricalUtilityMeterDeviceDefinition;
