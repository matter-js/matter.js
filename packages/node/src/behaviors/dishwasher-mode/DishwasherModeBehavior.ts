/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DishwasherMode } from "#clusters/dishwasher-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { DishwasherModeInterface } from "./DishwasherModeInterface.js";
import { Identity } from "#general";

/**
 * DishwasherModeBehavior is the base class for objects that support interaction with {@link DishwasherMode.Cluster}.
 */
export const DishwasherModeBehaviorConstructor = ClusterBehavior
    .withInterface<DishwasherModeInterface>()
    .for(DishwasherMode.Cluster);

export interface DishwasherModeBehaviorConstructor extends Identity<typeof DishwasherModeBehaviorConstructor> {}
export const DishwasherModeBehavior: DishwasherModeBehaviorConstructor = DishwasherModeBehaviorConstructor;
export interface DishwasherModeBehavior extends InstanceType<DishwasherModeBehaviorConstructor> {}
export namespace DishwasherModeBehavior {
    export interface State extends InstanceType<typeof DishwasherModeBehavior.State> {}
}
