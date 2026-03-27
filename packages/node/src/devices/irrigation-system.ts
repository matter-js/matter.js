/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    OperationalStateServer as BaseOperationalStateServer
} from "../behaviors/operational-state/OperationalStateServer.js";
import { FlowMeasurementServer as BaseFlowMeasurementServer } from "../behaviors/flow-measurement/FlowMeasurementServer.js";
import {
    FlowMeasurementBehavior as BaseFlowMeasurementBehavior
} from "../behaviors/flow-measurement/FlowMeasurementBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * This defines conformance to the Irrigation System device type. An irrigation system is used to control a group of
 * irrigation zones to water landscape. Irrigation systems are also commonly referred to as "Sprinkler Controllers"
 * since they are often used in residential and commercial settings to control and schedule in-ground sprinkler systems
 * for lawns. A physical irrigation system typically has a set of electrical terminals to which in-ground water valves
 * are connected so that the system can actuate them.
 *
 * @see {@link MatterSpecification.v142.Device} § 5.7
 */
export interface IrrigationSystemDevice extends Identity<typeof IrrigationSystemDeviceDefinition> {}

export namespace IrrigationSystemRequirements {
    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The OperationalState cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OperationalStateServer} for convenience.
     */
    export const OperationalStateServer = BaseOperationalStateServer;

    /**
     * The FlowMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FlowMeasurementServer} for convenience.
     */
    export const FlowMeasurementServer = BaseFlowMeasurementServer;

    /**
     * The FlowMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FlowMeasurementBehavior} for convenience.
     */
    export const FlowMeasurementBehavior = BaseFlowMeasurementBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        optional: {
            Identify: IdentifyServer,
            OperationalState: OperationalStateServer,
            FlowMeasurement: FlowMeasurementServer
        },
        mandatory: {}
    };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = { optional: { FlowMeasurement: FlowMeasurementBehavior }, mandatory: {} };
}

export const IrrigationSystemDeviceDefinition = MutableEndpoint({
    name: "IrrigationSystem",
    deviceType: 0x40,
    deviceRevision: 1,
    requirements: IrrigationSystemRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(IrrigationSystemDeviceDefinition);
export const IrrigationSystemDevice: IrrigationSystemDevice = IrrigationSystemDeviceDefinition;
