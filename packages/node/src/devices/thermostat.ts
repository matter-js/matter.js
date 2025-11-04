/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { ThermostatServer as BaseThermostatServer } from "../behaviors/thermostat/ThermostatServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import {
    ThermostatUserInterfaceConfigurationServer as BaseThermostatUserInterfaceConfigurationServer
} from "../behaviors/thermostat-user-interface-configuration/ThermostatUserInterfaceConfigurationServer.js";
import {
    EnergyPreferenceServer as BaseEnergyPreferenceServer
} from "../behaviors/energy-preference/EnergyPreferenceServer.js";
import { FanControlBehavior as BaseFanControlBehavior } from "../behaviors/fan-control/FanControlBehavior.js";
import {
    TemperatureMeasurementBehavior as BaseTemperatureMeasurementBehavior
} from "../behaviors/temperature-measurement/TemperatureMeasurementBehavior.js";
import {
    RelativeHumidityMeasurementBehavior as BaseRelativeHumidityMeasurementBehavior
} from "../behaviors/relative-humidity-measurement/RelativeHumidityMeasurementBehavior.js";
import {
    OccupancySensingBehavior as BaseOccupancySensingBehavior
} from "../behaviors/occupancy-sensing/OccupancySensingBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Thermostat device is capable of having either built-in or separate sensors for temperature, humidity or occupancy.
 * It allows the desired temperature to be set either remotely or locally. The thermostat is capable of sending heating
 * and/or cooling requirement notifications to a heating/cooling unit (for example, an indoor air handler) or is capable
 * of including a mechanism to control a heating or cooling unit directly.
 *
 * ThermostatDevice requires Thermostat cluster but Thermostat is not added by default because you must select the
 * features your device supports. You can add manually using ThermostatDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 9.1
 */
export interface ThermostatDevice extends Identity<typeof ThermostatDeviceDefinition> {}

export namespace ThermostatRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

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
     * The ThermostatUserInterfaceConfiguration cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThermostatUserInterfaceConfigurationServer} for
     * convenience.
     */
    export const ThermostatUserInterfaceConfigurationServer = BaseThermostatUserInterfaceConfigurationServer;

    /**
     * The EnergyPreference cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link EnergyPreferenceServer} for convenience.
     */
    export const EnergyPreferenceServer = BaseEnergyPreferenceServer;

    /**
     * The FanControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FanControlBehavior} for convenience.
     */
    export const FanControlBehavior = BaseFanControlBehavior;

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementBehavior} for convenience.
     */
    export const TemperatureMeasurementBehavior = BaseTemperatureMeasurementBehavior;

    /**
     * The RelativeHumidityMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RelativeHumidityMeasurementBehavior} for convenience.
     */
    export const RelativeHumidityMeasurementBehavior = BaseRelativeHumidityMeasurementBehavior;

    /**
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingBehavior} for convenience.
     */
    export const OccupancySensingBehavior = BaseOccupancySensingBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, Thermostat: ThermostatServer },
        optional: {
            Groups: GroupsServer,
            ThermostatUserInterfaceConfiguration: ThermostatUserInterfaceConfigurationServer,
            EnergyPreference: EnergyPreferenceServer
        }
    };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        optional: {
            FanControl: FanControlBehavior,
            TemperatureMeasurement: TemperatureMeasurementBehavior,
            RelativeHumidityMeasurement: RelativeHumidityMeasurementBehavior,
            OccupancySensing: OccupancySensingBehavior
        },

        mandatory: {}
    };
}

export const ThermostatDeviceDefinition = MutableEndpoint({
    name: "Thermostat",
    deviceType: 0x301,
    deviceRevision: 4,
    requirements: ThermostatRequirements,
    behaviors: SupportedBehaviors(ThermostatRequirements.server.mandatory.Identify)
});

export const ThermostatDevice: ThermostatDevice = ThermostatDeviceDefinition;
