/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThermostatBehavior as BaseThermostatBehavior } from "../behaviors/thermostat/ThermostatBehavior.js";
import { IdentifyBehavior as BaseIdentifyBehavior } from "../behaviors/identify/IdentifyBehavior.js";
import { GroupsBehavior as BaseGroupsBehavior } from "../behaviors/groups/GroupsBehavior.js";
import {
    ScenesManagementBehavior as BaseScenesManagementBehavior
} from "../behaviors/scenes-management/ScenesManagementBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Thermostat Controller is a device capable of controlling a Thermostat.
 *
 * @see {@link MatterSpecification.v142.Device} § 9.4
 */
export interface ThermostatControllerDevice extends Identity<typeof ThermostatControllerDeviceDefinition> {}

export namespace ThermostatControllerRequirements {
    /**
     * The Thermostat cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThermostatBehavior} for convenience.
     */
    export const ThermostatBehavior = BaseThermostatBehavior;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyBehavior} for convenience.
     */
    export const IdentifyBehavior = BaseIdentifyBehavior;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsBehavior} for convenience.
     */
    export const GroupsBehavior = BaseGroupsBehavior;

    /**
     * The ScenesManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementBehavior} for convenience.
     */
    export const ScenesManagementBehavior = BaseScenesManagementBehavior;

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { Thermostat: ThermostatBehavior },
        optional: { Identify: IdentifyBehavior, Groups: GroupsBehavior, ScenesManagement: ScenesManagementBehavior }
    };
}

export const ThermostatControllerDeviceDefinition = MutableEndpoint({
    name: "ThermostatController",
    deviceType: 0x30a,
    deviceRevision: 1,
    requirements: ThermostatControllerRequirements,
    behaviors: SupportedBehaviors()
});

export const ThermostatControllerDevice: ThermostatControllerDevice = ThermostatControllerDeviceDefinition;
