/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { IdentifyClient as BaseIdentifyClient } from "../behaviors/identify/IdentifyClient.js";
import { OnOffClient as BaseOnOffClient } from "../behaviors/on-off/OnOffClient.js";
import { LevelControlClient as BaseLevelControlClient } from "../behaviors/level-control/LevelControlClient.js";
import { ColorControlClient as BaseColorControlClient } from "../behaviors/color-control/ColorControlClient.js";
import { GroupsClient as BaseGroupsClient } from "../behaviors/groups/GroupsClient.js";
import {
    ScenesManagementClient as BaseScenesManagementClient
} from "../behaviors/scenes-management/ScenesManagementClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Color Dimmer Switch is a controller device that, when bound to a lighting device such as an Extended Color Light,
 * is capable of being used to adjust the color of the light being emitted.
 *
 * @see {@link MatterSpecification.v16.Device} § 6.3
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
     * We provide this alias to the default implementation {@link IdentifyClient} for convenience.
     */
    export const IdentifyClient = BaseIdentifyClient;

    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OnOffClient} for convenience.
     */
    export const OnOffClient = BaseOnOffClient;

    /**
     * The LevelControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link LevelControlClient} for convenience.
     */
    export const LevelControlClient = BaseLevelControlClient;

    /**
     * The ColorControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ColorControlClient} for convenience.
     */
    export const ColorControlClient = BaseColorControlClient;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsClient} for convenience.
     */
    export const GroupsClient = BaseGroupsClient;

    /**
     * The ScenesManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementClient} for convenience.
     */
    export const ScenesManagementClient = BaseScenesManagementClient;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: {
            Identify: IdentifyClient,
            OnOff: OnOffClient,
            LevelControl: LevelControlClient,
            ColorControl: ColorControlClient
        },

        optional: { Groups: GroupsClient, ScenesManagement: ScenesManagementClient }
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
