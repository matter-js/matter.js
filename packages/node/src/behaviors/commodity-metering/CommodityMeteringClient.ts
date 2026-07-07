/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CommodityMetering } from "@matter/types/clusters/commodity-metering";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const CommodityMeteringClientConstructor = ClientBehavior(CommodityMetering);
export interface CommodityMeteringClient extends InstanceType<typeof CommodityMeteringClientConstructor> {}
export interface CommodityMeteringClientConstructor extends Identity<typeof CommodityMeteringClientConstructor> {}
export const CommodityMeteringClient: CommodityMeteringClientConstructor = CommodityMeteringClientConstructor;
