/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import { ThermostatServer as BaseThermostatServer } from "../behaviors/thermostat/ThermostatServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import {
    ScenesManagementServer as BaseScenesManagementServer
} from "../behaviors/scenes-management/ScenesManagementServer.js";
import { FanControlServer as BaseFanControlServer } from "../behaviors/fan-control/FanControlServer.js";
import {
    ThermostatUserInterfaceConfigurationServer as BaseThermostatUserInterfaceConfigurationServer
} from "../behaviors/thermostat-user-interface-configuration/ThermostatUserInterfaceConfigurationServer.js";
import {
    TemperatureMeasurementServer as BaseTemperatureMeasurementServer
} from "../behaviors/temperature-measurement/TemperatureMeasurementServer.js";
import {
    RelativeHumidityMeasurementServer as BaseRelativeHumidityMeasurementServer
} from "../behaviors/relative-humidity-measurement/RelativeHumidityMeasurementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * This defines conformance to the Room Air Conditioner device type.
 *
 * A Room Air Conditioner is a device with the primary function of controlling the air temperature in a single room.
 *
 * RoomAirConditionerDevice requires Thermostat cluster but Thermostat is not added by default because you must select
 * the features your device supports. You can add manually using RoomAirConditionerDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 13.3
 */
export interface RoomAirConditionerDevice extends Identity<typeof RoomAirConditionerDeviceDefinition> {}

export namespace RoomAirConditionerRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * This version of {@link OnOffServer} is specialized per the specification.
     */
    export const OnOffServer = BaseOnOffServer.with("DeadFrontBehavior");

    /**
     * The Thermostat cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThermostatServer} for convenience.
     */
    export const ThermostatServer = BaseThermostatServer;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsServer} for convenience.
     */
    export const GroupsServer = BaseGroupsServer;

    /**
     * The ScenesManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementServer} for convenience.
     */
    export const ScenesManagementServer = BaseScenesManagementServer;

    /**
     * The FanControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FanControlServer} for convenience.
     */
    export const FanControlServer = BaseFanControlServer;

    /**
     * The ThermostatUserInterfaceConfiguration cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThermostatUserInterfaceConfigurationServer} for
     * convenience.
     */
    export const ThermostatUserInterfaceConfigurationServer = BaseThermostatUserInterfaceConfigurationServer;

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementServer} for convenience.
     */
    export const TemperatureMeasurementServer = BaseTemperatureMeasurementServer;

    /**
     * The RelativeHumidityMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RelativeHumidityMeasurementServer} for convenience.
     */
    export const RelativeHumidityMeasurementServer = BaseRelativeHumidityMeasurementServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, OnOff: OnOffServer, Thermostat: ThermostatServer },

        optional: {
            Groups: GroupsServer,
            ScenesManagement: ScenesManagementServer,
            FanControl: FanControlServer,
            ThermostatUserInterfaceConfiguration: ThermostatUserInterfaceConfigurationServer,
            TemperatureMeasurement: TemperatureMeasurementServer,
            RelativeHumidityMeasurement: RelativeHumidityMeasurementServer
        }
    };
}

export const RoomAirConditionerDeviceDefinition = MutableEndpoint({
    name: "RoomAirConditioner",
    deviceType: 0x72,
    deviceRevision: 2,
    requirements: RoomAirConditionerRequirements,
    behaviors: SupportedBehaviors(
        RoomAirConditionerRequirements.server.mandatory.Identify,
        RoomAirConditionerRequirements.server.mandatory.OnOff
    )
});

export const RoomAirConditionerDevice: RoomAirConditionerDevice = RoomAirConditionerDeviceDefinition;
