/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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
import {
    HepaFilterMonitoringServer as BaseHepaFilterMonitoringServer
} from "../behaviors/hepa-filter-monitoring/HepaFilterMonitoringServer.js";
import {
    ActivatedCarbonFilterMonitoringServer as BaseActivatedCarbonFilterMonitoringServer
} from "../behaviors/activated-carbon-filter-monitoring/ActivatedCarbonFilterMonitoringServer.js";
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
import { Identity } from "@matter/general";

/**
 * This defines conformance to the Room Air Conditioner device type.
 *
 * A Room Air Conditioner is a device with the primary function of controlling the air temperature in a single room.
 *
 * ### Room Air Conditioner Architecture
 *
 * A Room Air Conditioner is a device which at a minimum is capable of being turned on and off and of controlling the
 * temperature in the living space.
 *
 * A Room Air Conditioner may also support additional capabilities via endpoint composition. See Section 13.3.5, "Device
 * Type Requirements" for typical device types.
 *
 * The following diagram shows an example Room Air Conditioner consisting of a parent endpoint that is the Room Air
 * Conditioner device type and several child endpoints providing additional capabilities. Note that two of the child
 * endpoints are of the same device type, Temperature Sensor, which are being disambiguated via the requirements of
 * endpoint composition defined in the system model.
 *
 * ### Device Type Requirements
 *
 * A Room Air Conditioner may have zero or more of each device type listed in this table subject to the conformance
 * column of the table. All devices used in compositions shall adhere to the disambiguation requirements of the System
 * Model. Additional device types not listed in this table may also be included in device compositions.
 *
 * ### Cluster Restrictions
 *
 * #### On/Off Cluster (Server) Clarifications
 *
 * As indicated in the Element Requirements section below, the DF (Dead Front) feature is required for the On/Off
 * cluster in this device type. See the "DeadFrontBehavior feature" section in the On/Off cluster description for
 * detailed requirements. The "dead front" state is linked to the OnOff attribute in the On/Off cluster having the value
 * False. Thus, the Off command of the On/Off cluster shall move the device into the "dead front" state, the On command
 * of the On/Off cluster shall bring the device out of the "dead front" state, and the device shall adhere with the
 * associated requirements on subscription handling and event reporting.
 *
 * #### Best Effort Attribute Values in "Dead Front" State
 *
 * When in "dead front", should the operational values of the cluster attributes not be available or accessible, the
 * following are the recommended best effort values for per cluster attributes when responding to a new subscription
 * request or a read request. Attributes not listed have no change in their defined or expected values.
 *
 * RoomAirConditionerDevice requires Thermostat cluster but Thermostat is not added by default because you must select
 * the features your device supports. You can add manually using RoomAirConditionerDevice.with().
 *
 * @see {@link MatterSpecification.v16.Device} § 13.3
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
     * The HepaFilterMonitoring cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link HepaFilterMonitoringServer} for convenience.
     */
    export const HepaFilterMonitoringServer = BaseHepaFilterMonitoringServer;

    /**
     * The ActivatedCarbonFilterMonitoring cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ActivatedCarbonFilterMonitoringServer} for
     * convenience.
     */
    export const ActivatedCarbonFilterMonitoringServer = BaseActivatedCarbonFilterMonitoringServer;

    /**
     * The FanControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FanControlServer} for convenience.
     */
    export const FanControlServer = BaseFanControlServer;

    /**
     * The ThermostatUserInterfaceConfiguration cluster is optional per the Matter specification.
     *
     * This version of {@link ThermostatUserInterfaceConfigurationServer} is specialized per the specification.
     */
    export const ThermostatUserInterfaceConfigurationServer = BaseThermostatUserInterfaceConfigurationServer
        .alter({ attributes: { keypadLockout: { optional: true } } });

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
            HepaFilterMonitoring: HepaFilterMonitoringServer,
            ActivatedCarbonFilterMonitoring: ActivatedCarbonFilterMonitoringServer,
            FanControl: FanControlServer,
            ThermostatUserInterfaceConfiguration: ThermostatUserInterfaceConfigurationServer,
            TemperatureMeasurement: TemperatureMeasurementServer,
            RelativeHumidityMeasurement: RelativeHumidityMeasurementServer
        }
    };

    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = {
        optional: { TemperatureSensor: { deviceType: 0x302 }, HumiditySensor: { deviceType: 0x307 } }
    };
}

export const RoomAirConditionerDeviceDefinition = MutableEndpoint({
    name: "RoomAirConditioner",
    deviceType: 0x72,
    deviceRevision: 3,
    requirements: RoomAirConditionerRequirements,
    behaviors: SupportedBehaviors(
        RoomAirConditionerRequirements.server.mandatory.Identify,
        RoomAirConditionerRequirements.server.mandatory.OnOff
    )
});

Object.freeze(RoomAirConditionerDeviceDefinition);
export const RoomAirConditionerDevice: RoomAirConditionerDevice = RoomAirConditionerDeviceDefinition;
