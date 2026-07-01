/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { IdentifyClient as BaseIdentifyClient } from "../behaviors/identify/IdentifyClient.js";
import { OnOffClient as BaseOnOffClient } from "../behaviors/on-off/OnOffClient.js";
import { GroupsClient as BaseGroupsClient } from "../behaviors/groups/GroupsClient.js";
import { LevelControlClient as BaseLevelControlClient } from "../behaviors/level-control/LevelControlClient.js";
import {
    ScenesManagementClient as BaseScenesManagementClient
} from "../behaviors/scenes-management/ScenesManagementClient.js";
import { ColorControlClient as BaseColorControlClient } from "../behaviors/color-control/ColorControlClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * An On/Off Sensor is a measurement and sensing device that, when bound to a lighting device such as a Dimmable Light,
 * is capable of being used to switch the device on or off.
 *
 * @see {@link MatterSpecification.v16.Device} § 7.8
 */
export interface OnOffSensorDevice extends Identity<typeof OnOffSensorDeviceDefinition> {}

export namespace OnOffSensorRequirements {
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
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsClient} for convenience.
     */
    export const GroupsClient = BaseGroupsClient;

    /**
     * The LevelControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LevelControlClient} for convenience.
     */
    export const LevelControlClient = BaseLevelControlClient;

    /**
     * The ScenesManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementClient} for convenience.
     */
    export const ScenesManagementClient = BaseScenesManagementClient;

    /**
     * The ColorControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ColorControlClient} for convenience.
     */
    export const ColorControlClient = BaseColorControlClient;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { Identify: IdentifyClient, OnOff: OnOffClient },

        optional: {
            Groups: GroupsClient,
            LevelControl: LevelControlClient,
            ScenesManagement: ScenesManagementClient,
            ColorControl: ColorControlClient
        }
    };
}

export const OnOffSensorDeviceDefinition = MutableEndpoint({
    name: "OnOffSensor",
    deviceType: 0x850,
    deviceRevision: 3,
    requirements: OnOffSensorRequirements,
    behaviors: SupportedBehaviors(OnOffSensorRequirements.server.mandatory.Identify)
});

Object.freeze(OnOffSensorDeviceDefinition);
export const OnOffSensorDevice: OnOffSensorDevice = OnOffSensorDeviceDefinition;
