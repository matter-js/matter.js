/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { ClosureControlServer as BaseClosureControlServer } from "../behaviors/closure-control/ClosureControlServer.js";
import { WindowCoveringServer as BaseWindowCoveringServer } from "../behaviors/window-covering/WindowCoveringServer.js";
import {
    ClosureDimensionServer as BaseClosureDimensionServer
} from "../behaviors/closure-dimension/ClosureDimensionServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Closure is an element that seals an opening (such as a window, door, cabinet, wall, facade, ceiling, or roof). It
 * may contain one or more instances of a Closure Panel device type on separate child endpoints of the Closure parent.
 * Each Closure Panel is a sub-component of a Closure, capable of some change in state, primarily through a movement.
 *
 * All the common characteristics of a Closure are gathered within Closure Control Cluster. Moving parts or other
 * physical aspects of the device are exposed using Closure Dimension Cluster.
 *
 * ClosureDevice requires ClosureControl cluster but ClosureControl is not added by default because you must select the
 * features your device supports. You can add manually using ClosureDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 8.5
 */
export interface ClosureDevice extends Identity<typeof ClosureDeviceDefinition> {}

export namespace ClosureRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The ClosureControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ClosureControlServer} for convenience.
     */
    export const ClosureControlServer = BaseClosureControlServer;

    /**
     * The WindowCovering cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link WindowCoveringServer} for convenience.
     */
    export const WindowCoveringServer = BaseWindowCoveringServer;

    /**
     * The ClosureDimension cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ClosureDimensionServer} for convenience.
     */
    export const ClosureDimensionServer = BaseClosureDimensionServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, ClosureControl: ClosureControlServer },
        optional: { WindowCovering: WindowCoveringServer, ClosureDimension: ClosureDimensionServer }
    };

    /**
     * A definition for each device type required as a component endpoint per the Matter specification.
     */
    export const deviceTypes = {
        optional: {
            /**
             * The DoorLock device type is optional per the Matter specification.
             */
            DoorLock: { deviceType: 0xa },

            /**
             * The OnOffLight device type is optional per the Matter specification.
             */
            OnOffLight: { deviceType: 0x100 },

            /**
             * The ClosurePanel device type is optional per the Matter specification.
             */
            ClosurePanel: { deviceType: 0x231 }
        }
    };
}

export const ClosureDeviceDefinition = MutableEndpoint({
    name: "Closure",
    deviceType: 0x230,
    deviceRevision: 1,
    requirements: ClosureRequirements,
    behaviors: SupportedBehaviors(ClosureRequirements.server.mandatory.Identify)
});

Object.freeze(ClosureDeviceDefinition);
export const ClosureDevice: ClosureDevice = ClosureDeviceDefinition;
