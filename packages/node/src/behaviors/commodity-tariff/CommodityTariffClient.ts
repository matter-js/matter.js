/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CommodityTariff } from "@matter/types/clusters/commodity-tariff";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const CommodityTariffClientConstructor = ClientBehavior(CommodityTariff);
export interface CommodityTariffClient extends InstanceType<typeof CommodityTariffClientConstructor> {}
export interface CommodityTariffClientConstructor extends Identity<typeof CommodityTariffClientConstructor> {}
export const CommodityTariffClient: CommodityTariffClientConstructor = CommodityTariffClientConstructor;
