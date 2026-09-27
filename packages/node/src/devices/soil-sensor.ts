/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { SoilMeasurementServer as BaseSoilMeasurementServer } from "../behaviors/soil-measurement/SoilMeasurementServer.js";
import {
    TemperatureMeasurementServer as BaseTemperatureMeasurementServer
} from "../behaviors/temperature-measurement/TemperatureMeasurementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Soil Sensor device reports measurements of soil values, such as moisture and (optionally) temperature.
 *
 * ### Cluster Requirements
 *
 * #### Identify Cluster
 *
 * This is used to identify the endpoint.
 *
 * #### Temperature Measurement Cluster
 *
 * This is used to provide the temperature of the soil. Measurements SHOULD be done either in the soil or very close to
 * the soil, in order to NOT provide ambient temperature measurements.
 *
 * #### Soil Measurement Cluster
 *
 * This is used to provide the humidity of the soil.
 *
 * @see {@link MatterSpecification.v16.Device} § 7.14
 */
export interface SoilSensorDevice extends Identity<typeof SoilSensorDeviceDefinition> {}

export namespace SoilSensorRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The SoilMeasurement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link SoilMeasurementServer} for convenience.
     */
    export const SoilMeasurementServer = BaseSoilMeasurementServer;

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementServer} for convenience.
     */
    export const TemperatureMeasurementServer = BaseTemperatureMeasurementServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, SoilMeasurement: SoilMeasurementServer },
        optional: { TemperatureMeasurement: TemperatureMeasurementServer }
    };
}

export const SoilSensorDeviceDefinition = MutableEndpoint({
    name: "SoilSensor",
    deviceType: 0x45,
    deviceRevision: 1,
    requirements: SoilSensorRequirements,
    behaviors: SupportedBehaviors(
        SoilSensorRequirements.server.mandatory.Identify,
        SoilSensorRequirements.server.mandatory.SoilMeasurement
    )
});

Object.freeze(SoilSensorDeviceDefinition);
export const SoilSensorDevice: SoilSensorDevice = SoilSensorDeviceDefinition;
