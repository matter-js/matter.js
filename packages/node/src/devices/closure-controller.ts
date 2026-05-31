/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClosureControlClient as BaseClosureControlClient } from "../behaviors/closure-control/ClosureControlClient.js";
import { IdentifyClient as BaseIdentifyClient } from "../behaviors/identify/IdentifyClient.js";
import {
    ClosureDimensionClient as BaseClosureDimensionClient
} from "../behaviors/closure-dimension/ClosureDimensionClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Closure Controller is capable of controlling a Closure.
 *
 * @see {@link MatterSpecification.v151.Device} § 8.7
 */
export interface ClosureControllerDevice extends Identity<typeof ClosureControllerDeviceDefinition> {}

export namespace ClosureControllerRequirements {
    /**
     * The ClosureControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ClosureControlClient} for convenience.
     */
    export const ClosureControlClient = BaseClosureControlClient;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyClient} for convenience.
     */
    export const IdentifyClient = BaseIdentifyClient;

    /**
     * The ClosureDimension cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ClosureDimensionClient} for convenience.
     */
    export const ClosureDimensionClient = BaseClosureDimensionClient;

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { ClosureControl: ClosureControlClient },
        optional: { Identify: IdentifyClient, ClosureDimension: ClosureDimensionClient }
    };
}

export const ClosureControllerDeviceDefinition = MutableEndpoint({
    name: "ClosureController",
    deviceType: 0x23e,
    deviceRevision: 1,
    requirements: ClosureControllerRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(ClosureControllerDeviceDefinition);
export const ClosureControllerDevice: ClosureControllerDevice = ClosureControllerDeviceDefinition;
