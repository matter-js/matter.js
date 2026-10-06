/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BindingServer as BaseBindingServer } from "../behaviors/binding/BindingServer.js";
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
 * @see {@link MatterSpecification.v161.Device} § 9.4
 */
export interface ThermostatControllerDevice extends Identity<typeof ThermostatControllerDeviceDefinition> {}

export namespace ThermostatControllerRequirements {
    /**
     * The Binding cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link BindingServer} for convenience.
     */
    export const BindingServer = BaseBindingServer;

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
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Binding: BindingServer } };

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
    deviceRevision: 2,
    requirements: ThermostatControllerRequirements,
    behaviors: SupportedBehaviors(ThermostatControllerRequirements.server.mandatory.Binding)
});

Object.freeze(ThermostatControllerDeviceDefinition);
export const ThermostatControllerDevice: ThermostatControllerDevice = ThermostatControllerDeviceDefinition;
