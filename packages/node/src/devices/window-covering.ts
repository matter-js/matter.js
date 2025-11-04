/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { WindowCoveringServer as BaseWindowCoveringServer } from "../behaviors/window-covering/WindowCoveringServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

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
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, WindowCovering: WindowCoveringServer },
        optional: { Groups: GroupsServer }
    };
}

export const WindowCoveringDeviceDefinition = MutableEndpoint({
    name: "WindowCovering",
    deviceType: 0x202,
    deviceRevision: 4,
    requirements: WindowCoveringRequirements,
    behaviors: SupportedBehaviors(WindowCoveringRequirements.server.mandatory.Identify)
});

export const WindowCoveringDevice: WindowCoveringDevice = WindowCoveringDeviceDefinition;
