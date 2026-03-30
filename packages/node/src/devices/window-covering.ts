/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { WindowCoveringServer as BaseWindowCoveringServer } from "../behaviors/window-covering/WindowCoveringServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import { ClosureControlServer as BaseClosureControlServer } from "../behaviors/closure-control/ClosureControlServer.js";
import {
    ClosureDimensionServer as BaseClosureDimensionServer
} from "../behaviors/closure-dimension/ClosureDimensionServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * This defines conformance to the Window Covering device type.
 *
 * WindowCoveringDevice requires WindowCovering cluster but WindowCovering is not added by default because you must
 * select the features your device supports. You can add manually using WindowCoveringDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 8.3
 */
export interface WindowCoveringDevice extends Identity<typeof WindowCoveringDeviceDefinition> {}

export namespace WindowCoveringRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The WindowCovering cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WindowCoveringServer} for convenience.
     */
    export const WindowCoveringServer = BaseWindowCoveringServer;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsServer} for convenience.
     */
    export const GroupsServer = BaseGroupsServer;

    /**
     * The ClosureControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ClosureControlServer} for convenience.
     */
    export const ClosureControlServer = BaseClosureControlServer;

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
        mandatory: { Identify: IdentifyServer, WindowCovering: WindowCoveringServer },
        optional: {
            Groups: GroupsServer,
            ClosureControl: ClosureControlServer,
            ClosureDimension: ClosureDimensionServer
        }
    };
}

export const WindowCoveringDeviceDefinition = MutableEndpoint({
    name: "WindowCovering",
    deviceType: 0x202,
    deviceRevision: 6,
    requirements: WindowCoveringRequirements,
    behaviors: SupportedBehaviors(WindowCoveringRequirements.server.mandatory.Identify)
});

Object.freeze(WindowCoveringDeviceDefinition);
export const WindowCoveringDevice: WindowCoveringDevice = WindowCoveringDeviceDefinition;
