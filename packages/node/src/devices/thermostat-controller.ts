/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThermostatClient as BaseThermostatClient } from "../behaviors/thermostat/ThermostatClient.js";
import { IdentifyClient as BaseIdentifyClient } from "../behaviors/identify/IdentifyClient.js";
import { GroupsClient as BaseGroupsClient } from "../behaviors/groups/GroupsClient.js";
import {
    ScenesManagementClient as BaseScenesManagementClient
} from "../behaviors/scenes-management/ScenesManagementClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Thermostat Controller is a device capable of controlling a Thermostat.
 *
 * @see {@link MatterSpecification.v16.Device} § 9.4
 */
export interface ThermostatControllerDevice extends Identity<typeof ThermostatControllerDeviceDefinition> {}

export namespace ThermostatControllerRequirements {
    /**
     * The Thermostat cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThermostatClient} for convenience.
     */
    export const ThermostatClient = BaseThermostatClient;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyClient} for convenience.
     */
    export const IdentifyClient = BaseIdentifyClient;

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
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { Thermostat: ThermostatClient },
        optional: { Identify: IdentifyClient, Groups: GroupsClient, ScenesManagement: ScenesManagementClient }
    };
}

export const ThermostatControllerDeviceDefinition = MutableEndpoint({
    name: "ThermostatController",
    deviceType: 0x30a,
    deviceRevision: 1,
    requirements: ThermostatControllerRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(ThermostatControllerDeviceDefinition);
export const ThermostatControllerDevice: ThermostatControllerDevice = ThermostatControllerDeviceDefinition;
