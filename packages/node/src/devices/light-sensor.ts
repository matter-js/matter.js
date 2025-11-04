/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    IlluminanceMeasurementServer as BaseIlluminanceMeasurementServer
} from "../behaviors/illuminance-measurement/IlluminanceMeasurementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Light Sensor device is a measurement and sensing device that is capable of measuring and reporting the intensity of
 * light (illuminance) to which the sensor is being subjected.
 *
 * @see {@link MatterSpecification.v142.Device} § 7.2
 */
export interface LightSensorDevice extends Identity<typeof LightSensorDeviceDefinition> {}

export namespace LightSensorRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The IlluminanceMeasurement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IlluminanceMeasurementServer} for convenience.
     */
    export const IlluminanceMeasurementServer = BaseIlluminanceMeasurementServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer, IlluminanceMeasurement: IlluminanceMeasurementServer } };
}

export const LightSensorDeviceDefinition = MutableEndpoint({
    name: "LightSensor",
    deviceType: 0x106,
    deviceRevision: 3,
    requirements: LightSensorRequirements,
    behaviors: SupportedBehaviors(
        LightSensorRequirements.server.mandatory.Identify,
        LightSensorRequirements.server.mandatory.IlluminanceMeasurement
    )
});

Object.freeze(LightSensorDeviceDefinition);
export const LightSensorDevice: LightSensorDevice = LightSensorDeviceDefinition;
