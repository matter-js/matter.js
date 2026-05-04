/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CommodityPriceServer as BaseCommodityPriceServer } from "../behaviors/commodity-price/CommodityPriceServer.js";
import {
    ElectricalGridConditionsServer as BaseElectricalGridConditionsServer
} from "../behaviors/electrical-grid-conditions/ElectricalGridConditionsServer.js";
import { CommodityTariffServer as BaseCommodityTariffServer } from "../behaviors/commodity-tariff/CommodityTariffServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Electrical Energy Tariff is a device that defines a tariff for the consumption or production of electrical energy.
 *
 * @see {@link MatterSpecification.v151.Device} § 14.7
 */
export interface ElectricalEnergyTariffDevice extends Identity<typeof ElectricalEnergyTariffDeviceDefinition> {}

export namespace ElectricalEnergyTariffRequirements {
    /**
     * The CommodityPrice cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CommodityPriceServer} for convenience.
     */
    export const CommodityPriceServer = BaseCommodityPriceServer;

    /**
     * The ElectricalGridConditions cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ElectricalGridConditionsServer} for convenience.
     */
    export const ElectricalGridConditionsServer = BaseElectricalGridConditionsServer;

    /**
     * The CommodityTariff cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CommodityTariffServer} for convenience.
     */
    export const CommodityTariffServer = BaseCommodityTariffServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        optional: {
            CommodityPrice: CommodityPriceServer,
            ElectricalGridConditions: ElectricalGridConditionsServer,
            CommodityTariff: CommodityTariffServer
        },
        mandatory: {}
    };
}

export const ElectricalEnergyTariffDeviceDefinition = MutableEndpoint({
    name: "ElectricalEnergyTariff",
    deviceType: 0x513,
    deviceRevision: 1,
    requirements: ElectricalEnergyTariffRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(ElectricalEnergyTariffDeviceDefinition);
export const ElectricalEnergyTariffDevice: ElectricalEnergyTariffDevice = ElectricalEnergyTariffDeviceDefinition;
