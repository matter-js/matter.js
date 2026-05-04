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
 * @see {@link MatterSpecification.v151.Device} § 14.9
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
