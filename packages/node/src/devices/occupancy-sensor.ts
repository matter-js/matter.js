/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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
import { Identity } from "@matter/general";

/**
 * An Occupancy Sensor is a measurement and sensing device that is capable of measuring and reporting the occupancy
 * state in a designated area.
 *
 * ### Cluster Requirements
 *
 * #### Identify Cluster
 *
 * This is used to identify the endpoint.
 *
 * #### Boolean State Configuration Cluster
 *
 * This is used to configure the sensor/detector (e.g. sensitivity) and is for this device type linked to the
 * configuration of the Occupancy Sensing cluster on the same endpoint.
 *
 * #### Occupancy Sensing Cluster
 *
 * This is used to indicate occupancy as well as the type of occupancy sensor used for detection and configuring the
 * delays related to the occupied and unoccupied transitions.
 *
 * ### Multi-modality sensors
 *
 * The Occupancy Sensing cluster defines multiple modalities that can be employed to sense occupancy. A device
 * implementing multiple such modalities (exposed in the feature flags) can be implemented in two ways:
 *
 *   - A single endpoint with an Occupancy Sensing cluster which has two or more of these feature bits set to 1.
 *
 *   - This requires reporting the combination the sensing results as a single bit in the Occupancy attribute (and the
 *     OccupancyChanged event, when supported), with a single set of timing parameters applied.
 *
 *   - Sensitivity setting (via a Boolean State Configuration cluster on the same endpoint) applies to all the sensing
 *     modalities together via a manufacturer-specific mapping.
 *
 *   - Multiple endpoints each hosting an Occupancy Sensing cluster (each with one feature bit set):
 *
 *   - The sensing result of each modality is reported separately in the Occupancy attribute (and the OccupancyChanged
 *     event, when supported) of each endpoint, governed by the set of timing parameters provided in the cluster on that
 *     endpoint.
 *
 *   - This implies some of these attributes can have a different values than their counterparts on other endpoints and
 *     that a client may have to combine these values if it wants to derive a single value.
 *
 *   - Each modality can be provided with an independent sensitivity setting via a Boolean State Configuration cluster
 *     located on one or more of the endpoints.
 *
 * OccupancySensorDevice requires OccupancySensing cluster but OccupancySensing is not added by default because you must
 * select the features your device supports. You can add manually using OccupancySensorDevice.with().
 *
 * @see {@link MatterSpecification.v16.Device} § 7.3
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
