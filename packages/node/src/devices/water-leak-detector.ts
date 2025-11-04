/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
import { Identity } from "#general";

/**
 * This defines conformance to the Water Leak Detector device type.
 *
 * @see {@link MatterSpecification.v142.Device} § 7.12
 */
export interface WaterLeakDetectorDevice extends Identity<typeof WaterLeakDetectorDeviceDefinition> {}

export namespace WaterLeakDetectorRequirements {
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
    export const BooleanStateServer = BaseBooleanStateServer.alter({ events: { stateChange: { optional: false } } });

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

export const WaterLeakDetectorDeviceDefinition = MutableEndpoint({
    name: "WaterLeakDetector",
    deviceType: 0x43,
    deviceRevision: 1,
    requirements: WaterLeakDetectorRequirements,
    behaviors: SupportedBehaviors(
        WaterLeakDetectorRequirements.server.mandatory.Identify,
        WaterLeakDetectorRequirements.server.mandatory.BooleanState
    )
});

export const WaterLeakDetectorDevice: WaterLeakDetectorDevice = WaterLeakDetectorDeviceDefinition;
