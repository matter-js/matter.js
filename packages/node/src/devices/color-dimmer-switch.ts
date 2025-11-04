/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { IdentifyBehavior as BaseIdentifyBehavior } from "../behaviors/identify/IdentifyBehavior.js";
import { OnOffBehavior as BaseOnOffBehavior } from "../behaviors/on-off/OnOffBehavior.js";
import { LevelControlBehavior as BaseLevelControlBehavior } from "../behaviors/level-control/LevelControlBehavior.js";
import { ColorControlBehavior as BaseColorControlBehavior } from "../behaviors/color-control/ColorControlBehavior.js";
import { GroupsBehavior as BaseGroupsBehavior } from "../behaviors/groups/GroupsBehavior.js";
import {
    ScenesManagementBehavior as BaseScenesManagementBehavior
} from "../behaviors/scenes-management/ScenesManagementBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Color Dimmer Switch is a controller device that, when bound to a lighting device such as an Extended Color Light,
 * is capable of being used to adjust the color of the light being emitted.
 *
 * @see {@link MatterSpecification.v142.Device} § 6.3
 */
export interface ColorDimmerSwitchDevice extends Identity<typeof ColorDimmerSwitchDeviceDefinition> {}

export namespace ColorDimmerSwitchRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyBehavior} for convenience.
     */
    export const IdentifyBehavior = BaseIdentifyBehavior;

    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OnOffBehavior} for convenience.
     */
    export const OnOffBehavior = BaseOnOffBehavior;

    /**
     * The LevelControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link LevelControlBehavior} for convenience.
     */
    export const LevelControlBehavior = BaseLevelControlBehavior;

    /**
     * The ColorControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ColorControlBehavior} for convenience.
     */
    export const ColorControlBehavior = BaseColorControlBehavior;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsBehavior} for convenience.
     */
    export const GroupsBehavior = BaseGroupsBehavior;

    /**
     * The ScenesManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementBehavior} for convenience.
     */
    export const ScenesManagementBehavior = BaseScenesManagementBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: {
            Identify: IdentifyBehavior,
            OnOff: OnOffBehavior,
            LevelControl: LevelControlBehavior,
            ColorControl: ColorControlBehavior
        },

        optional: { Groups: GroupsBehavior, ScenesManagement: ScenesManagementBehavior }
    };
}

export const ColorDimmerSwitchDeviceDefinition = MutableEndpoint({
    name: "ColorDimmerSwitch",
    deviceType: 0x105,
    deviceRevision: 3,
    requirements: ColorDimmerSwitchRequirements,
    behaviors: SupportedBehaviors(ColorDimmerSwitchRequirements.server.mandatory.Identify)
});

Object.freeze(ColorDimmerSwitchDeviceDefinition);
export const ColorDimmerSwitchDevice: ColorDimmerSwitchDevice = ColorDimmerSwitchDeviceDefinition;
