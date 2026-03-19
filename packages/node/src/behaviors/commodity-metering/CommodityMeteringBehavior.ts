/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CommodityMetering } from "@matter/types/clusters/commodity-metering";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * CommodityMeteringBehavior is the base class for objects that support interaction with
 * {@link CommodityMetering.Cluster}.
 */
export const CommodityMeteringBehaviorConstructor = ClusterBehavior.for(CommodityMetering.Cluster);

export interface CommodityMeteringBehaviorConstructor extends Identity<typeof CommodityMeteringBehaviorConstructor> {}
export const CommodityMeteringBehavior: CommodityMeteringBehaviorConstructor = CommodityMeteringBehaviorConstructor;
export interface CommodityMeteringBehavior extends InstanceType<CommodityMeteringBehaviorConstructor> {}
export namespace CommodityMeteringBehavior {
    export interface State extends InstanceType<typeof CommodityMeteringBehavior.State> {}
}
