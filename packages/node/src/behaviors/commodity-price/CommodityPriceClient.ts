/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CommodityPrice } from "@matter/types/clusters/commodity-price";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const CommodityPriceClientConstructor = ClientBehavior(CommodityPrice);
export interface CommodityPriceClient extends InstanceType<typeof CommodityPriceClientConstructor> {}
export interface CommodityPriceClientConstructor extends Identity<typeof CommodityPriceClientConstructor> {}
export const CommodityPriceClient: CommodityPriceClientConstructor = CommodityPriceClientConstructor;
