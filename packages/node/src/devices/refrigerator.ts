/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    RefrigeratorAndTemperatureControlledCabinetModeServer as BaseRefrigeratorAndTemperatureControlledCabinetModeServer
} from "../behaviors/refrigerator-and-temperature-controlled-cabinet-mode/RefrigeratorAndTemperatureControlledCabinetModeServer.js";
import {
    RefrigeratorAlarmServer as BaseRefrigeratorAlarmServer
} from "../behaviors/refrigerator-alarm/RefrigeratorAlarmServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A refrigerator represents a device that contains one or more cabinets that are capable of chilling or freezing food.
 * Examples of consumer products that may make use of this device type include refrigerators, freezers, and wine
 * coolers.
 *
 * @see {@link MatterSpecification.v142.Device} § 13.2
 */
export interface RefrigeratorDevice extends Identity<typeof RefrigeratorDeviceDefinition> {}

export namespace RefrigeratorRequirements {
    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The RefrigeratorAndTemperatureControlledCabinetMode cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RefrigeratorAndTemperatureControlledCabinetModeServer}
     * for convenience.
     */
    export const RefrigeratorAndTemperatureControlledCabinetModeServer = BaseRefrigeratorAndTemperatureControlledCabinetModeServer;

    /**
     * The RefrigeratorAlarm cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RefrigeratorAlarmServer} for convenience.
     */
    export const RefrigeratorAlarmServer = BaseRefrigeratorAlarmServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        optional: {
            Identify: IdentifyServer,
            RefrigeratorAndTemperatureControlledCabinetMode: RefrigeratorAndTemperatureControlledCabinetModeServer,
            RefrigeratorAlarm: RefrigeratorAlarmServer
        },
        mandatory: {}
    };
}

export const RefrigeratorDeviceDefinition = MutableEndpoint({
    name: "Refrigerator",
    deviceType: 0x70,
    deviceRevision: 2,
    requirements: RefrigeratorRequirements,
    behaviors: SupportedBehaviors()
});

export const RefrigeratorDevice: RefrigeratorDevice = RefrigeratorDeviceDefinition;
