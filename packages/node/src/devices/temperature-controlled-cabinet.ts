/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    TemperatureControlServer as BaseTemperatureControlServer
} from "../behaviors/temperature-control/TemperatureControlServer.js";
import {
    TemperatureMeasurementServer as BaseTemperatureMeasurementServer
} from "../behaviors/temperature-measurement/TemperatureMeasurementServer.js";
import {
    RefrigeratorAndTemperatureControlledCabinetModeServer as BaseRefrigeratorAndTemperatureControlledCabinetModeServer
} from "../behaviors/refrigerator-and-temperature-controlled-cabinet-mode/RefrigeratorAndTemperatureControlledCabinetModeServer.js";
import { OvenModeServer as BaseOvenModeServer } from "../behaviors/oven-mode/OvenModeServer.js";
import {
    OvenCavityOperationalStateServer as BaseOvenCavityOperationalStateServer
} from "../behaviors/oven-cavity-operational-state/OvenCavityOperationalStateServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Temperature Controlled Cabinet only exists composed as part of another device type. It represents a single cabinet
 * that is capable of having its temperature controlled. Such a cabinet may be chilling or freezing food, for example as
 * part of a refrigerator, freezer, wine chiller, or other similar device. Equally, such a cabinet may be warming or
 * heating food, for example as part of an oven, range, or similar device.
 *
 * TemperatureControlledCabinetDevice requires TemperatureControl cluster but TemperatureControl is not added by default
 * because you must select the features your device supports. You can add manually using
 * TemperatureControlledCabinetDevice.with().
 *
 * @see {@link MatterSpecification.v141.Device} § 13.4
 */
export interface TemperatureControlledCabinetDevice extends Identity<typeof TemperatureControlledCabinetDeviceDefinition> {}

export namespace TemperatureControlledCabinetRequirements {
    /**
     * The TemperatureControl cluster is required by the Matter specification.
     *
     * This version of {@link TemperatureControlServer} is specialized per the specification.
     */
    export const TemperatureControlServer = BaseTemperatureControlServer.with("TemperatureNumber");

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementServer} for convenience.
     */
    export const TemperatureMeasurementServer = BaseTemperatureMeasurementServer;

    /**
     * The RefrigeratorAndTemperatureControlledCabinetMode cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RefrigeratorAndTemperatureControlledCabinetModeServer}
     * for convenience.
     */
    export const RefrigeratorAndTemperatureControlledCabinetModeServer = BaseRefrigeratorAndTemperatureControlledCabinetModeServer;

    /**
     * The OvenMode cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OvenModeServer} for convenience.
     */
    export const OvenModeServer = BaseOvenModeServer;

    /**
     * The OvenCavityOperationalState cluster is optional per the Matter specification.
     *
     * This version of {@link OvenCavityOperationalStateServer} is specialized per the specification.
     */
    export const OvenCavityOperationalStateServer = BaseOvenCavityOperationalStateServer
        .alter({ events: { operationCompletion: { optional: false } } });

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { TemperatureControl: TemperatureControlServer },

        optional: {
            TemperatureMeasurement: TemperatureMeasurementServer,
            RefrigeratorAndTemperatureControlledCabinetMode: RefrigeratorAndTemperatureControlledCabinetModeServer,
            OvenMode: OvenModeServer,
            OvenCavityOperationalState: OvenCavityOperationalStateServer
        }
    };
}

export const TemperatureControlledCabinetDeviceDefinition = MutableEndpoint({
    name: "TemperatureControlledCabinet",
    deviceType: 0x71,
    deviceRevision: 5,
    requirements: TemperatureControlledCabinetRequirements,
    behaviors: SupportedBehaviors()
});

export const TemperatureControlledCabinetDevice: TemperatureControlledCabinetDevice = TemperatureControlledCabinetDeviceDefinition;
