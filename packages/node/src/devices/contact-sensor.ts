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
 * This defines conformance to the Contact Sensor device type.
 *
 * @see {@link MatterSpecification.v142.Device} § 7.1
 */
export interface ContactSensorDevice extends Identity<typeof ContactSensorDeviceDefinition> {}

export namespace ContactSensorRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The BooleanState cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link BooleanStateServer} for convenience.
     */
    export const BooleanStateServer = BaseBooleanStateServer;

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

export const ContactSensorDeviceDefinition = MutableEndpoint({
    name: "ContactSensor",
    deviceType: 0x15,
    deviceRevision: 2,
    requirements: ContactSensorRequirements,
    behaviors: SupportedBehaviors(
        ContactSensorRequirements.server.mandatory.Identify,
        ContactSensorRequirements.server.mandatory.BooleanState
    )
});

Object.freeze(ContactSensorDeviceDefinition);
export const ContactSensorDevice: ContactSensorDevice = ContactSensorDeviceDefinition;
