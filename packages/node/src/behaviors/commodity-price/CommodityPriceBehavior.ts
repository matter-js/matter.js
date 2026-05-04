/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CommodityPrice } from "@matter/types/clusters/commodity-price";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * CommodityPriceBehavior is the base class for objects that support interaction with {@link CommodityPrice.Cluster}.
 *
 * This class does not have optional features of CommodityPrice.Cluster enabled. You can enable additional features
 * using CommodityPriceBehavior.with.
 */
export const CommodityPriceBehaviorConstructor = ClusterBehavior.for(CommodityPrice);

export interface CommodityPriceBehaviorConstructor extends Identity<typeof CommodityPriceBehaviorConstructor> {}
export const CommodityPriceBehavior: CommodityPriceBehaviorConstructor = CommodityPriceBehaviorConstructor;
export interface CommodityPriceBehavior extends InstanceType<CommodityPriceBehaviorConstructor> {}
export namespace CommodityPriceBehavior {
    export interface State extends InstanceType<typeof CommodityPriceBehavior.State> {}
}
