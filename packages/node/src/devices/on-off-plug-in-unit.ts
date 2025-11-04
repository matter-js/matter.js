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
 * An On/Off Plug-in Unit is a device that provides power to another device that is plugged into it, and is capable of
 * switching that provided power on or off.
 *
 * The Mounted On/Off Control (added in Matter 1.4) has identical cluster requirements as the On/Off Plug-In Unit, and
 * is marked as superset of this device type (since Matter 1.4.2). For devices intended to be mounted permanently, the
 * Mounted On/Off Control device type shall be used, with the On/Off Plug-In Unit device type optionally added in the
 * DeviceTypeList of the Descriptor cluster in addition to the On/Off Plug-In Unit device type (see
 * [ref_MountedOnOffControlServerGuidance]).
 *
 * ### Before Matter 1.4, mounted units typically used the On/Off Plug-In Unit device type. Clients can encounter
 * devices which were made before or after these specification updates. Therefore, clients SHOULD use the following
 * heuristic to distinguish the type of physical device based on the device type revision found on an endpoint ("--"
 * means the device type is not listed).
 *
 * @see {@link MatterSpecification.v142.Device} § 5.1
 */
export interface OnOffPlugInUnitDevice extends Identity<typeof OnOffPlugInUnitDeviceDefinition> {}

export namespace OnOffPlugInUnitRequirements {
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

export const OnOffPlugInUnitDeviceDefinition = MutableEndpoint({
    name: "OnOffPlugInUnit",
    deviceType: 0x10a,
    deviceRevision: 4,
    requirements: OnOffPlugInUnitRequirements,

    behaviors: SupportedBehaviors(
        OnOffPlugInUnitRequirements.server.mandatory.Identify,
        OnOffPlugInUnitRequirements.server.mandatory.Groups,
        OnOffPlugInUnitRequirements.server.mandatory.ScenesManagement,
        OnOffPlugInUnitRequirements.server.mandatory.OnOff
    )
});

Object.freeze(OnOffPlugInUnitDeviceDefinition);
export const OnOffPlugInUnitDevice: OnOffPlugInUnitDevice = OnOffPlugInUnitDeviceDefinition;
