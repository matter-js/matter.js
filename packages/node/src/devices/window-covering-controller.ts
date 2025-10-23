/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    WindowCoveringBehavior as BaseWindowCoveringBehavior
} from "../behaviors/window-covering/WindowCoveringBehavior.js";
import { IdentifyBehavior as BaseIdentifyBehavior } from "../behaviors/identify/IdentifyBehavior.js";
import { GroupsBehavior as BaseGroupsBehavior } from "../behaviors/groups/GroupsBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Window Covering Controller is a device that controls an automatic window covering.
 *
 * @see {@link MatterSpecification.v141.Device} § 8.4
 */
export interface WindowCoveringControllerDevice extends Identity<typeof WindowCoveringControllerDeviceDefinition> {}

export namespace WindowCoveringControllerRequirements {
    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The WindowCovering cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WindowCoveringBehavior} for convenience.
     */
    export const WindowCoveringBehavior = BaseWindowCoveringBehavior;

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
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { optional: { Identify: IdentifyServer }, mandatory: {} };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { WindowCovering: WindowCoveringBehavior },
        optional: { Identify: IdentifyBehavior, Groups: GroupsBehavior }
    };
}

export const WindowCoveringControllerDeviceDefinition = MutableEndpoint({
    name: "WindowCoveringController",
    deviceType: 0x203,
    deviceRevision: 4,
    requirements: WindowCoveringControllerRequirements,
    behaviors: SupportedBehaviors()
});

export const WindowCoveringControllerDevice: WindowCoveringControllerDevice = WindowCoveringControllerDeviceDefinition;
