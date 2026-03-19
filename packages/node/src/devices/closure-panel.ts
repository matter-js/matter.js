/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    ClosureDimensionServer as BaseClosureDimensionServer
} from "../behaviors/closure-dimension/ClosureDimensionServer.js";
import { WindowCoveringServer as BaseWindowCoveringServer } from "../behaviors/window-covering/WindowCoveringServer.js";
import { ClosureControlServer as BaseClosureControlServer } from "../behaviors/closure-control/ClosureControlServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Closure Panel shall ONLY exist as a part (child) of a Closure device type. It represents a single panel aspect
 * (e.g. position of a blind, tilt of slats, etc) within that Closure.
 *
 * This panel can be used to express the following:
 *
 *   - Translation : panel translates along one axis
 *
 *   - Rotation : panel rotates around an axis of rotation
 *
 *   - Modulation : panel modifies its aspect to modulate a flow
 *
 * A Closure Panel shall use exactly one semantic tag from the ClosurePanel namespace (0x45) in the TagList attribute of
 * the Descriptor cluster to describe the spatial aspect of the dimension, e.g., "Lift", "Tilt", etc.
 *
 * ClosurePanelDevice requires ClosureDimension cluster but ClosureDimension is not added by default because you must
 * select the features your device supports. You can add manually using ClosurePanelDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 8.6
 */
export interface ClosurePanelDevice extends Identity<typeof ClosurePanelDeviceDefinition> {}

export namespace ClosurePanelRequirements {
    /**
     * The ClosureDimension cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ClosureDimensionServer} for convenience.
     */
    export const ClosureDimensionServer = BaseClosureDimensionServer;

    /**
     * The WindowCovering cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link WindowCoveringServer} for convenience.
     */
    export const WindowCoveringServer = BaseWindowCoveringServer;

    /**
     * The ClosureControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ClosureControlServer} for convenience.
     */
    export const ClosureControlServer = BaseClosureControlServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { ClosureDimension: ClosureDimensionServer },
        optional: { WindowCovering: WindowCoveringServer, ClosureControl: ClosureControlServer }
    };
}

export const ClosurePanelDeviceDefinition = MutableEndpoint({
    name: "ClosurePanel",
    deviceType: 0x231,
    deviceRevision: 1,
    requirements: ClosurePanelRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(ClosurePanelDeviceDefinition);
export const ClosurePanelDevice: ClosurePanelDevice = ClosurePanelDeviceDefinition;
