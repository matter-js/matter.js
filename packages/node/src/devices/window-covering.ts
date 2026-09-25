/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { WindowCoveringServer as BaseWindowCoveringServer } from "../behaviors/window-covering/WindowCoveringServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * This defines conformance to the Window Covering device type.
 *
 * ### Cluster Requirements
 *
 * Furthermore, in revision at or before revision 5 for this device type, either or both of the Closure Control cluster
 * and the Closure Dimension cluster shall NOT appear on the same endpoint. This is to avoid potential future usage of
 * the closely related Closure Control cluster in this device type from interfering with non-standard usage of that
 * cluster until proper data dependency language can be introduced, if any.
 *
 * WindowCoveringDevice requires WindowCovering cluster but WindowCovering is not added by default because you must
 * select the features your device supports. You can add manually using WindowCoveringDevice.with().
 *
 * @see {@link MatterSpecification.v16.Device} § 8.3
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
    deviceRevision: 7,
    requirements: WindowCoveringRequirements,
    behaviors: SupportedBehaviors(WindowCoveringRequirements.server.mandatory.Identify)
});

Object.freeze(WindowCoveringDeviceDefinition);
export const WindowCoveringDevice: WindowCoveringDevice = WindowCoveringDeviceDefinition;
