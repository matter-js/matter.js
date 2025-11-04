/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import { FanControlServer as BaseFanControlServer } from "../behaviors/fan-control/FanControlServer.js";
import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Fan device is typically standalone or mounted on a ceiling or wall and is used to circulate air in a room.
 *
 * @see {@link MatterSpecification.v142.Device} § 9.2
 */
export interface FanDevice extends Identity<typeof FanDeviceDefinition> {}

export namespace FanRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The Groups cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsServer} for convenience.
     */
    export const GroupsServer = BaseGroupsServer;

    /**
     * The FanControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link FanControlServer} for convenience.
     */
    export const FanControlServer = BaseFanControlServer;

    /**
     * The OnOff cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OnOffServer} for convenience.
     */
    export const OnOffServer = BaseOnOffServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, Groups: GroupsServer, FanControl: FanControlServer },
        optional: { OnOff: OnOffServer }
    };
}

export const FanDeviceDefinition = MutableEndpoint({
    name: "Fan",
    deviceType: 0x2b,
    deviceRevision: 3,
    requirements: FanRequirements,
    behaviors: SupportedBehaviors(
        FanRequirements.server.mandatory.Identify,
        FanRequirements.server.mandatory.Groups,
        FanRequirements.server.mandatory.FanControl
    )
});

export const FanDevice: FanDevice = FanDeviceDefinition;
