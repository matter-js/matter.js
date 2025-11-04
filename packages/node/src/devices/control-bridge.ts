/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { IdentifyBehavior as BaseIdentifyBehavior } from "../behaviors/identify/IdentifyBehavior.js";
import { GroupsBehavior as BaseGroupsBehavior } from "../behaviors/groups/GroupsBehavior.js";
import {
    ScenesManagementBehavior as BaseScenesManagementBehavior
} from "../behaviors/scenes-management/ScenesManagementBehavior.js";
import { OnOffBehavior as BaseOnOffBehavior } from "../behaviors/on-off/OnOffBehavior.js";
import { LevelControlBehavior as BaseLevelControlBehavior } from "../behaviors/level-control/LevelControlBehavior.js";
import { ColorControlBehavior as BaseColorControlBehavior } from "../behaviors/color-control/ColorControlBehavior.js";
import {
    IlluminanceMeasurementBehavior as BaseIlluminanceMeasurementBehavior
} from "../behaviors/illuminance-measurement/IlluminanceMeasurementBehavior.js";
import {
    OccupancySensingBehavior as BaseOccupancySensingBehavior
} from "../behaviors/occupancy-sensing/OccupancySensingBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Control Bridge is a controller device that, when bound to a lighting device such as an Extended Color Light, is
 * capable of being used to switch the device on or off, adjust the intensity of the light being emitted and adjust the
 * color of the light being emitted. In addition, a Control Bridge device is capable of being used for setting scenes.
 *
 * @see {@link MatterSpecification.v142.Device} § 6.4
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
     * We provide this alias to the default implementation {@link IdentifyBehavior} for convenience.
     */
    export const IdentifyBehavior = BaseIdentifyBehavior;

    /**
     * The Groups cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsBehavior} for convenience.
     */
    export const GroupsBehavior = BaseGroupsBehavior;

    /**
     * The ScenesManagement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementBehavior} for convenience.
     */
    export const ScenesManagementBehavior = BaseScenesManagementBehavior;

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
     * The IlluminanceMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IlluminanceMeasurementBehavior} for convenience.
     */
    export const IlluminanceMeasurementBehavior = BaseIlluminanceMeasurementBehavior;

    /**
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingBehavior} for convenience.
     */
    export const OccupancySensingBehavior = BaseOccupancySensingBehavior;

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
            Groups: GroupsBehavior,
            ScenesManagement: ScenesManagementBehavior,
            OnOff: OnOffBehavior,
            LevelControl: LevelControlBehavior,
            ColorControl: ColorControlBehavior
        },

        optional: {
            IlluminanceMeasurement: IlluminanceMeasurementBehavior,
            OccupancySensing: OccupancySensingBehavior
        }
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
