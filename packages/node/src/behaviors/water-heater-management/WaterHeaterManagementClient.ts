/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WaterHeaterManagement } from "#clusters/water-heater-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const WaterHeaterManagementClientConstructor = ClientBehavior(WaterHeaterManagement.Complete);
export interface WaterHeaterManagementClient extends InstanceType<typeof WaterHeaterManagementClientConstructor> {}
export interface WaterHeaterManagementClientConstructor extends Identity<typeof WaterHeaterManagementClientConstructor> {}
export const WaterHeaterManagementClient: WaterHeaterManagementClientConstructor = WaterHeaterManagementClientConstructor;
