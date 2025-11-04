/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    TemperatureMeasurementServer as BaseTemperatureMeasurementServer
} from "../behaviors/temperature-measurement/TemperatureMeasurementServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Temperature Sensor device reports measurements of temperature.
 *
 * @see {@link MatterSpecification.v142.Device} § 7.4
 */
export interface TemperatureSensorDevice extends Identity<typeof TemperatureSensorDeviceDefinition> {}

export namespace TemperatureSensorRequirements {
    /**
     * The TemperatureMeasurement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementServer} for convenience.
     */
    export const TemperatureMeasurementServer = BaseTemperatureMeasurementServer;

    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { TemperatureMeasurement: TemperatureMeasurementServer, Identify: IdentifyServer } };
}

export const TemperatureSensorDeviceDefinition = MutableEndpoint({
    name: "TemperatureSensor",
    deviceType: 0x302,
    deviceRevision: 2,
    requirements: TemperatureSensorRequirements,
    behaviors: SupportedBehaviors(
        TemperatureSensorRequirements.server.mandatory.TemperatureMeasurement,
        TemperatureSensorRequirements.server.mandatory.Identify
    )
});

Object.freeze(TemperatureSensorDeviceDefinition);
export const TemperatureSensorDevice: TemperatureSensorDevice = TemperatureSensorDeviceDefinition;
