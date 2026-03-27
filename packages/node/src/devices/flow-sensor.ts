/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { FlowMeasurementServer as BaseFlowMeasurementServer } from "../behaviors/flow-measurement/FlowMeasurementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Flow Sensor device measures and reports the flow rate of a fluid.
 *
 * @see {@link MatterSpecification.v142.Device} § 7.6
 */
export interface FlowSensorDevice extends Identity<typeof FlowSensorDeviceDefinition> {}

export namespace FlowSensorRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The FlowMeasurement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link FlowMeasurementServer} for convenience.
     */
    export const FlowMeasurementServer = BaseFlowMeasurementServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Identify: IdentifyServer, FlowMeasurement: FlowMeasurementServer } };
}

export const FlowSensorDeviceDefinition = MutableEndpoint({
    name: "FlowSensor",
    deviceType: 0x306,
    deviceRevision: 2,
    requirements: FlowSensorRequirements,
    behaviors: SupportedBehaviors(
        FlowSensorRequirements.server.mandatory.Identify,
        FlowSensorRequirements.server.mandatory.FlowMeasurement
    )
});

Object.freeze(FlowSensorDeviceDefinition);
export const FlowSensorDevice: FlowSensorDevice = FlowSensorDeviceDefinition;
