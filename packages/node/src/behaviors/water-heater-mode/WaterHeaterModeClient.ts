/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WaterHeaterMode } from "#clusters/water-heater-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const WaterHeaterModeClientConstructor = ClientBehavior(WaterHeaterMode.Complete);
export interface WaterHeaterModeClient extends InstanceType<typeof WaterHeaterModeClientConstructor> {}
export interface WaterHeaterModeClientConstructor extends Identity<typeof WaterHeaterModeClientConstructor> {}
export const WaterHeaterModeClient: WaterHeaterModeClientConstructor = WaterHeaterModeClientConstructor;
