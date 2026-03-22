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
 * @see {@link MatterSpecification.v142.Device} § 14.6
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

    /**
     * A definition for each device type required as a component endpoint per the Matter specification.
     */
    export const deviceTypes = {
        optional: {
            /**
             * The ElectricalEnergyTariff device type is optional per the Matter specification.
             */
            ElectricalEnergyTariff: { deviceType: 0x513 },

            /**
             * The ElectricalMeter device type is optional per the Matter specification.
             */
            ElectricalMeter: { deviceType: 0x514 }
        }
    };
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
