/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DishwasherMode } from "#clusters/dishwasher-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const DishwasherModeClientConstructor = ClientBehavior(DishwasherMode.Complete);
export interface DishwasherModeClient extends InstanceType<typeof DishwasherModeClientConstructor> {}
export interface DishwasherModeClientConstructor extends Identity<typeof DishwasherModeClientConstructor> {}
export const DishwasherModeClient: DishwasherModeClientConstructor = DishwasherModeClientConstructor;
