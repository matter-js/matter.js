/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PowerSourceServer as BasePowerSourceServer } from "../behaviors/power-source/PowerSourceServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "#model";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * PowerSourceEndpoint requires PowerSource cluster but PowerSource is not added by default because you must select the
 * features your device supports. You can add manually using PowerSourceEndpoint.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 2.2
 */
export interface PowerSourceEndpoint extends Identity<typeof PowerSourceEndpointDefinition> {}

export namespace PowerSourceRequirements {
    /**
     * The PowerSource cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link PowerSourceServer} for convenience.
     */
    export const PowerSourceServer = BasePowerSourceServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { PowerSource: PowerSourceServer } };
}

export const PowerSourceEndpointDefinition = MutableEndpoint({
    name: "PowerSource",
    deviceType: 0x11,
    deviceRevision: 1,
    deviceClass: DeviceClassification.Utility,
    requirements: PowerSourceRequirements,
    behaviors: SupportedBehaviors()
});

export const PowerSourceEndpoint: PowerSourceEndpoint = PowerSourceEndpointDefinition;
