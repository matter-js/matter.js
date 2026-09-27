/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    ValveConfigurationAndControlServer as BaseValveConfigurationAndControlServer
} from "../behaviors/valve-configuration-and-control/ValveConfigurationAndControlServer.js";
import { FlowMeasurementServer as BaseFlowMeasurementServer } from "../behaviors/flow-measurement/FlowMeasurementServer.js";
import { FlowMeasurementClient as BaseFlowMeasurementClient } from "../behaviors/flow-measurement/FlowMeasurementClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * This defines conformance to the Water Valve device type.
 *
 * ### Cluster Requirements
 *
 * #### Identify Cluster
 *
 * This cluster is used to identify the device.
 *
 * #### Valve Configuration and Control Cluster
 *
 * This cluster is used to configure and control (Open/Close) the valve.
 *
 * #### Flow Measurement Cluster
 *
 * The cluster server, if present, shall be used to report the measured flow through the valve.
 *
 * The cluster client, if present, may be used via binding to close a control loop of flow through the valve.
 *
 * ### Device implementation recommendations
 *
 * #### Start Up Behavior
 *
 * The start up behavior of a device with this device type, is currently not specified and is considered manufacturer
 * specific. This means that the start up behavior and what is considered the "safe state", most suitable for the
 * specific device, is defined by the manufacturer.
 *
 * #### Firmware Update
 *
 * When a device with this device type needs to update its firmware (or restart for another reason), it is strongly
 * recommended to only perform the update/restart when the valve is in its closed state, as well as ignoring any open
 * request during this update/restart, given the chance a valve can unintentionally be left in the open state, for
 * longer periods of time.
 *
 * @see {@link MatterSpecification.v16.Device} § 5.6
 */
export interface WaterValveDevice extends Identity<typeof WaterValveDeviceDefinition> {}

export namespace WaterValveRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The ValveConfigurationAndControl cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ValveConfigurationAndControlServer} for convenience.
     */
    export const ValveConfigurationAndControlServer = BaseValveConfigurationAndControlServer;

    /**
     * The FlowMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FlowMeasurementServer} for convenience.
     */
    export const FlowMeasurementServer = BaseFlowMeasurementServer;

    /**
     * The FlowMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FlowMeasurementClient} for convenience.
     */
    export const FlowMeasurementClient = BaseFlowMeasurementClient;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, ValveConfigurationAndControl: ValveConfigurationAndControlServer },
        optional: { FlowMeasurement: FlowMeasurementServer }
    };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = { optional: { FlowMeasurement: FlowMeasurementClient } };
}

export const WaterValveDeviceDefinition = MutableEndpoint({
    name: "WaterValve",
    deviceType: 0x42,
    deviceRevision: 1,
    requirements: WaterValveRequirements,
    behaviors: SupportedBehaviors(
        WaterValveRequirements.server.mandatory.Identify,
        WaterValveRequirements.server.mandatory.ValveConfigurationAndControl
    )
});

Object.freeze(WaterValveDeviceDefinition);
export const WaterValveDevice: WaterValveDevice = WaterValveDeviceDefinition;
