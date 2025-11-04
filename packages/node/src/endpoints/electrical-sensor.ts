/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PowerTopologyServer as BasePowerTopologyServer } from "../behaviors/power-topology/PowerTopologyServer.js";
import {
    ElectricalPowerMeasurementServer as BaseElectricalPowerMeasurementServer
} from "../behaviors/electrical-power-measurement/ElectricalPowerMeasurementServer.js";
import {
    ElectricalEnergyMeasurementServer as BaseElectricalEnergyMeasurementServer
} from "../behaviors/electrical-energy-measurement/ElectricalEnergyMeasurementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "#model";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * An Electrical Sensor device measures the electrical power and/or energy being imported and/or exported.
 *
 * ElectricalSensorEndpoint requires PowerTopology cluster but PowerTopology is not added by default because you must
 * select the features your device supports. You can add manually using ElectricalSensorEndpoint.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 2.6
 */
export interface ElectricalSensorEndpoint extends Identity<typeof ElectricalSensorEndpointDefinition> {}

export namespace ElectricalSensorRequirements {
    /**
     * The PowerTopology cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link PowerTopologyServer} for convenience.
     */
    export const PowerTopologyServer = BasePowerTopologyServer;

    /**
     * The ElectricalPowerMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ElectricalPowerMeasurementServer} for convenience.
     */
    export const ElectricalPowerMeasurementServer = BaseElectricalPowerMeasurementServer;

    /**
     * The ElectricalEnergyMeasurement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ElectricalEnergyMeasurementServer} for convenience.
     */
    export const ElectricalEnergyMeasurementServer = BaseElectricalEnergyMeasurementServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { PowerTopology: PowerTopologyServer },
        optional: {
            ElectricalPowerMeasurement: ElectricalPowerMeasurementServer,
            ElectricalEnergyMeasurement: ElectricalEnergyMeasurementServer
        }
    };
}

export const ElectricalSensorEndpointDefinition = MutableEndpoint({
    name: "ElectricalSensor",
    deviceType: 0x510,
    deviceRevision: 1,
    deviceClass: DeviceClassification.Utility,
    requirements: ElectricalSensorRequirements,
    behaviors: SupportedBehaviors()
});

export const ElectricalSensorEndpoint: ElectricalSensorEndpoint = ElectricalSensorEndpointDefinition;
