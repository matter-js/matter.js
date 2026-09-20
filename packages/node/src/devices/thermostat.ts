/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { ThermostatServer as BaseThermostatServer } from "../behaviors/thermostat/ThermostatServer.js";
import { GroupsServer as BaseGroupsServer } from "../behaviors/groups/GroupsServer.js";
import {
    EnergyPreferenceServer as BaseEnergyPreferenceServer
} from "../behaviors/energy-preference/EnergyPreferenceServer.js";
import {
    ThermostatUserInterfaceConfigurationServer as BaseThermostatUserInterfaceConfigurationServer
} from "../behaviors/thermostat-user-interface-configuration/ThermostatUserInterfaceConfigurationServer.js";
import { FanControlClient as BaseFanControlClient } from "../behaviors/fan-control/FanControlClient.js";
import {
    TemperatureMeasurementClient as BaseTemperatureMeasurementClient
} from "../behaviors/temperature-measurement/TemperatureMeasurementClient.js";
import {
    RelativeHumidityMeasurementClient as BaseRelativeHumidityMeasurementClient
} from "../behaviors/relative-humidity-measurement/RelativeHumidityMeasurementClient.js";
import {
    OccupancySensingClient as BaseOccupancySensingClient
} from "../behaviors/occupancy-sensing/OccupancySensingClient.js";
import {
    AmbientContextSensingClient as BaseAmbientContextSensingClient
} from "../behaviors/ambient-context-sensing/AmbientContextSensingClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Thermostat device is capable of having either built-in or separate sensors for temperature, humidity or occupancy.
 * It allows the desired temperature to be set either remotely or locally. The thermostat is capable of sending heating
 * and/or cooling requirement notifications to a heating/cooling unit (for example, an indoor air handler) or is capable
 * of including a mechanism to control a heating or cooling unit directly.
 *
 * ### Thermostat Suggestion and Predicted Activity Considerations
 *
 * The thermostat cluster contains the Thermostat Suggestion feature, which allows clients to provide suggestions based
 * on external contexts. The thermostat might also support the Ambient Context Sensing client and take action based on
 * the context provided by the Predicted Activity feature. Thermostats may support either of these features. If both
 * functionalities are supported, the following recommendations are provided to Thermostat devices:
 *
 *   - Changes which the thermostat wants to apply as a result of the data provided by the Ambient Context Sensing
 *     server, SHOULD be translated into a Thermostat Suggestion and SHOULD NOT be directly applied, in order to let the
 *     thermostat evaluate the change in state with any other suggestion provided by other clients.
 *
 *   - If the resulting action from the context provided by the Ambient Context Sensing client can not be translated
 *     into a supported Thermostat Suggestion, the Thermostat may apply the change directly, but should be aware that it
 *     might impact the evaluation of any current suggestions and the behavior related to conflict resolution between
 *     the current suggestions and the input from the Ambient Context Sensing client is manufacturer specific.
 *
 *   - The thermostat may prioritize the data provided by the Ambient Context Sensing server, in case there are multiple
 *     suggestions present, and use this as input when deciding which suggestion to apply.
 *
 * ThermostatDevice requires Thermostat cluster but Thermostat is not added by default because you must select the
 * features your device supports. You can add manually using ThermostatDevice.with().
 *
 * @see {@link MatterSpecification.v16.Device} § 9.1
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
     * The EnergyPreference cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link EnergyPreferenceServer} for convenience.
     */
    export const EnergyPreferenceServer = BaseEnergyPreferenceServer;

    /**
     * The ThermostatUserInterfaceConfiguration cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ThermostatUserInterfaceConfigurationServer} for
     * convenience.
     */
    export const ThermostatUserInterfaceConfigurationServer = BaseThermostatUserInterfaceConfigurationServer;

    /**
     * The FanControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link FanControlClient} for convenience.
     */
    export const FanControlClient = BaseFanControlClient;

    /**
     * The TemperatureMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TemperatureMeasurementClient} for convenience.
     */
    export const TemperatureMeasurementClient = BaseTemperatureMeasurementClient;

    /**
     * The RelativeHumidityMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link RelativeHumidityMeasurementClient} for convenience.
     */
    export const RelativeHumidityMeasurementClient = BaseRelativeHumidityMeasurementClient;

    /**
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingClient} for convenience.
     */
    export const OccupancySensingClient = BaseOccupancySensingClient;

    /**
     * The AmbientContextSensing cluster is provisional per the Matter specification (conformance P, O), so it is
     * treated as optional.
     *
     * We provide this alias to the default implementation {@link AmbientContextSensingClient} for convenience.
     */
    export const AmbientContextSensingClient = BaseAmbientContextSensingClient;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { Identify: IdentifyServer, Thermostat: ThermostatServer },
        optional: {
            Groups: GroupsServer,
            EnergyPreference: EnergyPreferenceServer,
            ThermostatUserInterfaceConfiguration: ThermostatUserInterfaceConfigurationServer
        }
    };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        optional: {
            FanControl: FanControlClient,
            TemperatureMeasurement: TemperatureMeasurementClient,
            RelativeHumidityMeasurement: RelativeHumidityMeasurementClient,
            OccupancySensing: OccupancySensingClient,
            AmbientContextSensing: AmbientContextSensingClient
        }
    };
}

export const ThermostatDeviceDefinition = MutableEndpoint({
    name: "Thermostat",
    deviceType: 0x301,
    deviceRevision: 6,
    requirements: ThermostatRequirements,
    behaviors: SupportedBehaviors(ThermostatRequirements.server.mandatory.Identify)
});

Object.freeze(ThermostatDeviceDefinition);
export const ThermostatDevice: ThermostatDevice = ThermostatDeviceDefinition;
