/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { BooleanStateServer as BaseBooleanStateServer } from "../behaviors/boolean-state/BooleanStateServer.js";
import {
    BooleanStateConfigurationServer as BaseBooleanStateConfigurationServer
} from "../behaviors/boolean-state-configuration/BooleanStateConfigurationServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * This defines conformance to the Water Freeze Detector device type.
 *
 * ### Cluster Requirements
 *
 * #### Identify Cluster
 *
 * This is used to identify the endpoint.
 *
 * #### Boolean State Cluster
 *
 * This is used to indicate the state of the sensor/detector.
 *
 * The state of the Boolean State cluster shall reflect the sensor detection using this scheme of:
 *
 * Due to the difficulty in quantifying the risk of freezing based on the dependency on external factors such as
 * temperature, humidity, pressure, etc, the actual triggering of a detector of this type depends on the physical
 * construction and characteristics of the device and is therefore considered manufacturer specific.
 *
 * #### Boolean State Configuration Cluster
 *
 * This is used to configure the sensor/detector and is for this device type linked to the configuration of the Boolean
 * State cluster.
 *
 * @see {@link MatterSpecification.v16.Device} § 7.11
 */
export interface WaterFreezeDetectorDevice extends Identity<typeof WaterFreezeDetectorDeviceDefinition> {}

export namespace WaterFreezeDetectorRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The BooleanState cluster is required by the Matter specification.
     *
     * This version of {@link BooleanStateServer} is specialized per the specification.
     */
    export const BooleanStateServer = BaseBooleanStateServer
        .with("ChangeEvent")
        .alter({ events: { stateChange: { optional: false } } });

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
        mandatory: { Identify: IdentifyServer, BooleanState: BooleanStateServer },
        optional: { BooleanStateConfiguration: BooleanStateConfigurationServer }
    };
}

export const WaterFreezeDetectorDeviceDefinition = MutableEndpoint({
    name: "WaterFreezeDetector",
    deviceType: 0x41,
    deviceRevision: 2,
    requirements: WaterFreezeDetectorRequirements,
    behaviors: SupportedBehaviors(
        WaterFreezeDetectorRequirements.server.mandatory.Identify,
        WaterFreezeDetectorRequirements.server.mandatory.BooleanState
    )
});

Object.freeze(WaterFreezeDetectorDeviceDefinition);
export const WaterFreezeDetectorDevice: WaterFreezeDetectorDevice = WaterFreezeDetectorDeviceDefinition;
