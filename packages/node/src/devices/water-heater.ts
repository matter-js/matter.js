/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    WaterHeaterManagementServer as BaseWaterHeaterManagementServer
} from "../behaviors/water-heater-management/WaterHeaterManagementServer.js";
import {
    WaterHeaterModeServer as BaseWaterHeaterModeServer
} from "../behaviors/water-heater-mode/WaterHeaterModeServer.js";
import { ThermostatServer as BaseThermostatServer } from "../behaviors/thermostat/ThermostatServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A water heater is a device that is generally installed in properties to heat water for showers, baths etc.
 *
 * ### Water Heater Architecture
 *
 * A Water Heater is always defined via endpoint composition.
 *
 * If a Water Heater supports multiple temperature measurement sensors as child elements, it shall include a separate
 * endpoint for each sensor. Each endpoint shall include a semantic tag in the TagList attribute of the Descriptor
 * cluster to describe the relevant position of the sensor. Such a semantic tag shall be from the defined Common
 * Position namespace (i.e. Top, Middle, Bottom etc).
 *
 * For basic control features the Water Heater re-uses the Thermostat cluster with the HEAT and SCH features. This
 * allows it to have daily schedules set as to when the hot water heating is enabled, as well as setting the desired
 * setpoint of the hot water.
 *
 * Additional features of the Water Heater (such as reporting estimated hot water content, and smart reheating
 * functions) are provided by the Water Heater application cluster.
 *
 * In order to add energy management capability, the Device Energy Management cluster may be optionally supported, and
 * if so, the Electrical Power Measurement and Electrical Energy Measurement clusters are supported via the Electrical
 * Sensor device type.
 *
 * An example of a Water Heater device is illustrated below.
 *
 * ### Element Requirements
 *
 * The Energy Management feature of the Water Heater cluster shall be supported if the Device Energy Management device
 * type is included.
 *
 * If Off is a supported SystemMode in the Thermostat cluster, setting the SystemMode of the Thermostat cluster to Off
 * shall set the CurrentMode attribute of the Water Heater Mode cluster to a mode having the Off mode tag value and vice
 * versa.
 *
 * At least one entry in the SupportedModes attribute of the Water Heater Mode cluster shall include the Timed mode tag
 * in the ModeTags field list.
 *
 * ### Device Type Requirements
 *
 * A Water Heater shall be composed of at least one endpoint with device types as defined by the conformance below.
 * There may be more endpoints with other device types existing in the Water Heater.
 *
 * #### Electrical Sensor Device Type
 *
 * If a Device Energy Management device type is included as part of a composition, the Electrical Sensor device type
 * shall also be included.
 *
 * #### Cluster Requirements on Component Device Types
 *
 * If an Electrical Sensor device is included as part of a composition, it shall include both the Electrical Energy
 * Measurement and Electrical Power Measurement clusters, measuring the total energy and power of the Water Heater.
 *
 * #### Element Requirements on Component Device Types
 *
 * If a Device Energy Management device type is included on a separate endpoint as part of a composition and the Device
 * Energy Management cluster is supported on the same endpoint, the PowerForecastReporting feature of the Device Energy
 * Management cluster shall also be supported.
 *
 * @see {@link MatterSpecification.v16.Device} § 14.2
 */
export interface WaterHeaterDevice extends Identity<typeof WaterHeaterDeviceDefinition> {}

export namespace WaterHeaterRequirements {
    /**
     * The WaterHeaterManagement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WaterHeaterManagementServer} for convenience.
     */
    export const WaterHeaterManagementServer = BaseWaterHeaterManagementServer;

    /**
     * The WaterHeaterMode cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WaterHeaterModeServer} for convenience.
     */
    export const WaterHeaterModeServer = BaseWaterHeaterModeServer;

    /**
     * The Thermostat cluster is required by the Matter specification.
     *
     * This version of {@link ThermostatServer} is specialized per the specification.
     */
    export const ThermostatServer = BaseThermostatServer.with("Heating");

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            WaterHeaterManagement: WaterHeaterManagementServer,
            WaterHeaterMode: WaterHeaterModeServer,
            Thermostat: ThermostatServer
        },
        optional: { Identify: IdentifyServer }
    };

    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = {
        optional: {
            PowerSource: { deviceType: 0x11 },
            TemperatureSensor: { deviceType: 0x302 },

            DeviceEnergyManagement: {
                deviceType: 0x50d,

                requires: [{
                    element: "serverCluster",
                    name: "DeviceEnergyManagement",
                    id: 0x98,
                    requires: [{ element: "feature", name: "POWERFORECASTREPORTING" }]
                }]
            },

            ElectricalSensor: {
                deviceType: 0x510,
                conformance: "desc",
                requires: [
                    { element: "serverCluster", name: "ElectricalPowerMeasurement", id: 0x90 },
                    { element: "serverCluster", name: "ElectricalEnergyMeasurement", id: 0x91 }
                ]
            }
        }
    };
}

export const WaterHeaterDeviceDefinition = MutableEndpoint({
    name: "WaterHeater",
    deviceType: 0x50f,
    deviceRevision: 1,
    requirements: WaterHeaterRequirements,
    behaviors: SupportedBehaviors(
        WaterHeaterRequirements.server.mandatory.WaterHeaterManagement,
        WaterHeaterRequirements.server.mandatory.WaterHeaterMode,
        WaterHeaterRequirements.server.mandatory.Thermostat
    )
});

Object.freeze(WaterHeaterDeviceDefinition);
export const WaterHeaterDevice: WaterHeaterDevice = WaterHeaterDeviceDefinition;
