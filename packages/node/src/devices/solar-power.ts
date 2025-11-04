/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Solar Power device is a device that allows a solar panel array, which can optionally be comprised of a set parallel
 * strings of solar panels, and its associated controller and, if appropriate, inverter, to be monitored and controlled
 * by an Energy Management System.
 *
 * @see {@link MatterSpecification.v142.Device} § 14.3
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
    export const server = { optional: { Identify: IdentifyServer }, mandatory: {} };
}

export const SolarPowerDeviceDefinition = MutableEndpoint({
    name: "SolarPower",
    deviceType: 0x17,
    deviceRevision: 1,
    requirements: SolarPowerRequirements,
    behaviors: SupportedBehaviors()
});

export const SolarPowerDevice: SolarPowerDevice = SolarPowerDeviceDefinition;
