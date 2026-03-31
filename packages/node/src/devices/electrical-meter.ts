/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    ElectricalPowerMeasurementServer as BaseElectricalPowerMeasurementServer
} from "../behaviors/electrical-power-measurement/ElectricalPowerMeasurementServer.js";
import {
    ElectricalEnergyMeasurementServer as BaseElectricalEnergyMeasurementServer
} from "../behaviors/electrical-energy-measurement/ElectricalEnergyMeasurementServer.js";
import {
    CommodityMeteringServer as BaseCommodityMeteringServer
} from "../behaviors/commodity-metering/CommodityMeteringServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * An Electrical Meter device meters the electrical energy being imported and/or exported for billing purposes.
 *
 * ElectricalMeterDevice requires ElectricalPowerMeasurement and ElectricalEnergyMeasurement clusters but they are not
 * added by default because you must select the features your device supports. You can add manually using
 * ElectricalMeterDevice.with().
 *
 * @see {@link MatterSpecification.v151.Device} § 14.8
 */
export interface ElectricalMeterDevice extends Identity<typeof ElectricalMeterDeviceDefinition> {}

export namespace ElectricalMeterRequirements {
    /**
     * The ElectricalPowerMeasurement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ElectricalPowerMeasurementServer} for convenience.
     */
    export const ElectricalPowerMeasurementServer = BaseElectricalPowerMeasurementServer;

    /**
     * The ElectricalEnergyMeasurement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ElectricalEnergyMeasurementServer} for convenience.
     */
    export const ElectricalEnergyMeasurementServer = BaseElectricalEnergyMeasurementServer;

    /**
     * The CommodityMetering cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CommodityMeteringServer} for convenience.
     */
    export const CommodityMeteringServer = BaseCommodityMeteringServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            ElectricalPowerMeasurement: ElectricalPowerMeasurementServer,
            ElectricalEnergyMeasurement: ElectricalEnergyMeasurementServer
        },
        optional: { CommodityMetering: CommodityMeteringServer }
    };
}

export const ElectricalMeterDeviceDefinition = MutableEndpoint({
    name: "ElectricalMeter",
    deviceType: 0x514,
    deviceRevision: 1,
    requirements: ElectricalMeterRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(ElectricalMeterDeviceDefinition);
export const ElectricalMeterDevice: ElectricalMeterDevice = ElectricalMeterDeviceDefinition;
