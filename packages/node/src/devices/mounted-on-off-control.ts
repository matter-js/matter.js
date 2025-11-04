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
 * A Mounted On/Off Control is a fixed device that provides power to another device or power circuit that is connected
 * to it, and is capable of switching that provided power on or off.
 *
 * This device type is intended for any wall-mounted or hardwired load controller, while On/Off Plug-in Unit is intended
 * only for smart plugs and other power switching devices that are not permanently connected, and which can be unplugged
 * from their power source.
 *
 * > [!NOTE]
 *
 * > Since this device type was added in Matter 1.4, for endpoints using this device type it is recommended to add the
 *   subset device type On/Off Plug-in Unit to the DeviceTypeList of the Descriptor cluster on the same endpoint for
 *   backward compatibility with existing clients.
 *
 * See [ref_MountedOnOffClientGuidance] for client guidance with these two device types.
 *
 * @see {@link MatterSpecification.v142.Device} § 5.3
 */
export interface MountedOnOffControlDevice extends Identity<typeof MountedOnOffControlDeviceDefinition> {}

export namespace MountedOnOffControlRequirements {
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

export const MountedOnOffControlDeviceDefinition = MutableEndpoint({
    name: "MountedOnOffControl",
    deviceType: 0x10f,
    deviceRevision: 2,
    requirements: MountedOnOffControlRequirements,

    behaviors: SupportedBehaviors(
        MountedOnOffControlRequirements.server.mandatory.Identify,
        MountedOnOffControlRequirements.server.mandatory.Groups,
        MountedOnOffControlRequirements.server.mandatory.ScenesManagement,
        MountedOnOffControlRequirements.server.mandatory.OnOff
    )
});

Object.freeze(MountedOnOffControlDeviceDefinition);
export const MountedOnOffControlDevice: MountedOnOffControlDevice = MountedOnOffControlDeviceDefinition;
