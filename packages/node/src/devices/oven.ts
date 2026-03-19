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
 * An oven represents a device that contains one or more cabinets, and optionally a single cooktop, that are all capable
 * of heating food. Examples of consumer products implementing this device type include ovens, wall ovens, convection
 * ovens, etc.
 *
 * @see {@link MatterSpecification.v142.Device} § 13.9
 */
export interface OvenDevice extends Identity<typeof OvenDeviceDefinition> {}

export namespace OvenRequirements {
    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { optional: { Identify: IdentifyServer }, mandatory: {} };

    /**
     * A definition for each device type required as a component endpoint per the Matter specification.
     */
    export const deviceTypes = {
        mandatory: {
            /**
             * The TemperatureControlledCabinet device type is required per the Matter specification.
             */
            TemperatureControlledCabinet: { deviceType: 0x71 }
        },

        optional: {
            /**
             * The Cooktop device type is optional per the Matter specification.
             */
            Cooktop: { deviceType: 0x78 }
        }
    };
}

export const OvenDeviceDefinition = MutableEndpoint({
    name: "Oven",
    deviceType: 0x7b,
    deviceRevision: 2,
    requirements: OvenRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(OvenDeviceDefinition);
export const OvenDevice: OvenDevice = OvenDeviceDefinition;
