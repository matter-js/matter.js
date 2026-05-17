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
import {
    ScenesManagementClient as BaseScenesManagementClient
} from "../behaviors/scenes-management/ScenesManagementClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * An On/Off Light Switch is a controller device that, when bound to a lighting device such as an On/Off Light, is
 * capable of being used to switch the device on or off.
 *
 * @see {@link MatterSpecification.v151.Device} § 6.1
 */
export interface OnOffLightSwitchDevice extends Identity<typeof OnOffLightSwitchDeviceDefinition> {}

export namespace OnOffLightSwitchRequirements {
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
        mandatory: { Identify: IdentifyClient, OnOff: OnOffClient },
        optional: { Groups: GroupsClient, ScenesManagement: ScenesManagementClient }
    };
}

export const OnOffLightSwitchDeviceDefinition = MutableEndpoint({
    name: "OnOffLightSwitch",
    deviceType: 0x103,
    deviceRevision: 3,
    requirements: OnOffLightSwitchRequirements,
    behaviors: SupportedBehaviors(OnOffLightSwitchRequirements.server.mandatory.Identify)
});

Object.freeze(OnOffLightSwitchDeviceDefinition);
export const OnOffLightSwitchDevice: OnOffLightSwitchDevice = OnOffLightSwitchDeviceDefinition;
