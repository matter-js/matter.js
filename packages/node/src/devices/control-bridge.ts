/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { IdentifyClient as BaseIdentifyClient } from "../behaviors/identify/IdentifyClient.js";
import { GroupsClient as BaseGroupsClient } from "../behaviors/groups/GroupsClient.js";
import { OnOffClient as BaseOnOffClient } from "../behaviors/on-off/OnOffClient.js";
import { LevelControlClient as BaseLevelControlClient } from "../behaviors/level-control/LevelControlClient.js";
import {
    ScenesManagementClient as BaseScenesManagementClient
} from "../behaviors/scenes-management/ScenesManagementClient.js";
import { ColorControlClient as BaseColorControlClient } from "../behaviors/color-control/ColorControlClient.js";
import {
    IlluminanceMeasurementClient as BaseIlluminanceMeasurementClient
} from "../behaviors/illuminance-measurement/IlluminanceMeasurementClient.js";
import {
    OccupancySensingClient as BaseOccupancySensingClient
} from "../behaviors/occupancy-sensing/OccupancySensingClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Control Bridge is a controller device that, when bound to a lighting device such as an Extended Color Light, is
 * capable of being used to switch the device on or off, adjust the intensity of the light being emitted and adjust the
 * color of the light being emitted. In addition, a Control Bridge device is capable of being used for setting scenes.
 *
 * @see {@link MatterSpecification.v151.Device} § 6.4
 */
export interface ControlBridgeDevice extends Identity<typeof ControlBridgeDeviceDefinition> {}

export namespace ControlBridgeRequirements {
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
     * The Groups cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsClient} for convenience.
     */
    export const GroupsClient = BaseGroupsClient;

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
     * The ScenesManagement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementClient} for convenience.
     */
    export const ScenesManagementClient = BaseScenesManagementClient;

    /**
     * The ColorControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ColorControlClient} for convenience.
     */
    export const ColorControlClient = BaseColorControlClient;

    /**
     * The IlluminanceMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IlluminanceMeasurementClient} for convenience.
     */
    export const IlluminanceMeasurementClient = BaseIlluminanceMeasurementClient;

    /**
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingClient} for convenience.
     */
    export const OccupancySensingClient = BaseOccupancySensingClient;

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
            Groups: GroupsClient,
            OnOff: OnOffClient,
            LevelControl: LevelControlClient,
            ScenesManagement: ScenesManagementClient,
            ColorControl: ColorControlClient
        },

        optional: { IlluminanceMeasurement: IlluminanceMeasurementClient, OccupancySensing: OccupancySensingClient }
    };
}

export const ControlBridgeDeviceDefinition = MutableEndpoint({
    name: "ControlBridge",
    deviceType: 0x840,
    deviceRevision: 3,
    requirements: ControlBridgeRequirements,
    behaviors: SupportedBehaviors(ControlBridgeRequirements.server.mandatory.Identify)
});

Object.freeze(ControlBridgeDeviceDefinition);
export const ControlBridgeDevice: ControlBridgeDevice = ControlBridgeDeviceDefinition;
