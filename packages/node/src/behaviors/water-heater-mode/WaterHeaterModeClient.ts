/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WaterHeaterMode } from "@matter/types/clusters/water-heater-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const WaterHeaterModeClientConstructor = ClientBehavior(WaterHeaterMode);
export interface WaterHeaterModeClient extends InstanceType<typeof WaterHeaterModeClientConstructor> {}
export interface WaterHeaterModeClientConstructor extends Identity<typeof WaterHeaterModeClientConstructor> {}
export const WaterHeaterModeClient: WaterHeaterModeClientConstructor = WaterHeaterModeClientConstructor;
