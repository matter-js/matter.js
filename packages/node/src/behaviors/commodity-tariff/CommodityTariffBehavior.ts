/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CommodityTariff } from "@matter/types/clusters/commodity-tariff";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * CommodityTariffBehavior is the base class for objects that support interaction with {@link CommodityTariff.Cluster}.
 *
 * CommodityTariff.Cluster requires you to enable one or more optional features. You can do so using
 * {@link CommodityTariffBehavior.with}.
 */
export const CommodityTariffBehaviorConstructor = ClusterBehavior.for(CommodityTariff);

export interface CommodityTariffBehaviorConstructor extends Identity<typeof CommodityTariffBehaviorConstructor> {}
export const CommodityTariffBehavior: CommodityTariffBehaviorConstructor = CommodityTariffBehaviorConstructor;
export interface CommodityTariffBehavior extends InstanceType<CommodityTariffBehaviorConstructor> {}
export namespace CommodityTariffBehavior {
    export interface State extends InstanceType<typeof CommodityTariffBehavior.State> {}
}
