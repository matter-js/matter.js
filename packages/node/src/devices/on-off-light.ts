/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import {
    ScenesManagementServer as BaseScenesManagementServer
} from "../behaviors/scenes-management/ScenesManagementServer.js";
import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import { LevelControlServer as BaseLevelControlServer } from "../behaviors/level-control/LevelControlServer.js";
import {
    OccupancySensingBehavior as BaseOccupancySensingBehavior
} from "../behaviors/occupancy-sensing/OccupancySensingBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * The On/Off Light is a lighting device that is capable of being switched on or off by means of a bound controller
 * device such as an On/Off Light Switch or a Dimmer Switch. In addition, an on/off light is also capable of being
 * switched by means of a bound occupancy sensor.
 *
 * @see {@link MatterSpecification.v141.Device} § 4.1
 */
export interface OnOffLightDevice extends Identity<typeof OnOffLightDeviceDefinition> {}

export namespace OnOffLightRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * This version of {@link IdentifyServer} is specialized per the specification.
     */
    export const IdentifyServer = BaseIdentifyServer.alter({ commands: { triggerEffect: { optional: false } } });

    /**
     * The Groups cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsServer} for convenience.
     */
    export const GroupsServer = BaseGroupsServer;

    /**
     * The ScenesManagement cluster is required by the Matter specification.
     *
     * This version of {@link ScenesManagementServer} is specialized per the specification.
     */
    export const ScenesManagementServer = BaseScenesManagementServer
        .alter({ commands: { copyScene: { optional: false } } });

    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * This version of {@link OnOffServer} is specialized per the specification.
     */
    export const OnOffServer = BaseOnOffServer.with("Lighting");

    /**
     * The LevelControl cluster is optional per the Matter specification.
     *
     * This version of {@link LevelControlServer} is specialized per the specification.
     */
    export const LevelControlServer = BaseLevelControlServer
        .with("OnOff", "Lighting")
        .alter({
            attributes: {
                currentLevel: { min: 1, max: 254 },
                minLevel: { default: 1, min: 1, max: 2 },
                maxLevel: { default: 254, min: 254, max: 255 }
            }
        });

    /**
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingBehavior} for convenience.
     */
    export const OccupancySensingBehavior = BaseOccupancySensingBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            Identify: IdentifyServer,
            Groups: GroupsServer,
            ScenesManagement: ScenesManagementServer,
            OnOff: OnOffServer
        },

        optional: { LevelControl: LevelControlServer }
    };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = { optional: { OccupancySensing: OccupancySensingBehavior }, mandatory: {} };
}

export const OnOffLightDeviceDefinition = MutableEndpoint({
    name: "OnOffLight",
    deviceType: 0x100,
    deviceRevision: 3,
    requirements: OnOffLightRequirements,

    behaviors: SupportedBehaviors(
        OnOffLightRequirements.server.mandatory.Identify,
        OnOffLightRequirements.server.mandatory.Groups,
        OnOffLightRequirements.server.mandatory.ScenesManagement,
        OnOffLightRequirements.server.mandatory.OnOff
    )
});

export const OnOffLightDevice: OnOffLightDevice = OnOffLightDeviceDefinition;
