/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    ClosureControlBehavior as BaseClosureControlBehavior
} from "../behaviors/closure-control/ClosureControlBehavior.js";
import { IdentifyBehavior as BaseIdentifyBehavior } from "../behaviors/identify/IdentifyBehavior.js";
import { GroupsBehavior as BaseGroupsBehavior } from "../behaviors/groups/GroupsBehavior.js";
import {
    ClosureDimensionBehavior as BaseClosureDimensionBehavior
} from "../behaviors/closure-dimension/ClosureDimensionBehavior.js";
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
     * We provide this alias to the default implementation {@link ClosureControlBehavior} for convenience.
     */
    export const ClosureControlBehavior = BaseClosureControlBehavior;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyBehavior} for convenience.
     */
    export const IdentifyBehavior = BaseIdentifyBehavior;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsBehavior} for convenience.
     */
    export const GroupsBehavior = BaseGroupsBehavior;

    /**
     * The ClosureDimension cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ClosureDimensionBehavior} for convenience.
     */
    export const ClosureDimensionBehavior = BaseClosureDimensionBehavior;

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { ClosureControl: ClosureControlBehavior },
        optional: { Identify: IdentifyBehavior, Groups: GroupsBehavior, ClosureDimension: ClosureDimensionBehavior }
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
