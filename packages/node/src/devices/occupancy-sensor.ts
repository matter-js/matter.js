/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    OccupancySensingServer as BaseOccupancySensingServer
} from "../behaviors/occupancy-sensing/OccupancySensingServer.js";
import {
    BooleanStateConfigurationServer as BaseBooleanStateConfigurationServer
} from "../behaviors/boolean-state-configuration/BooleanStateConfigurationServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * An Occupancy Sensor is a measurement and sensing device that is capable of measuring and reporting the occupancy
 * state in a designated area.
 *
 * OccupancySensorDevice requires OccupancySensing cluster but OccupancySensing is not added by default because you must
 * select the features your device supports. You can add manually using OccupancySensorDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 7.3
 */
export interface OccupancySensorDevice extends Identity<typeof OccupancySensorDeviceDefinition> {}

export namespace OccupancySensorRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The OccupancySensing cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingServer} for convenience.
     */
    export const OccupancySensingServer = BaseOccupancySensingServer;

    /**
     * The BooleanStateConfiguration cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link BooleanStateConfigurationServer} for convenience.
     */
    export const BooleanStateConfigurationServer = BaseBooleanStateConfigurationServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, OccupancySensing: OccupancySensingServer },
        optional: { BooleanStateConfiguration: BooleanStateConfigurationServer }
    };
}

export const OccupancySensorDeviceDefinition = MutableEndpoint({
    name: "OccupancySensor",
    deviceType: 0x107,
    deviceRevision: 4,
    requirements: OccupancySensorRequirements,
    behaviors: SupportedBehaviors(OccupancySensorRequirements.server.mandatory.Identify)
});

Object.freeze(OccupancySensorDeviceDefinition);
export const OccupancySensorDevice: OccupancySensorDevice = OccupancySensorDeviceDefinition;
