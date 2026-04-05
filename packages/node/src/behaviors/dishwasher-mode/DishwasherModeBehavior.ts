/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DishwasherMode } from "@matter/types/clusters/dishwasher-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * DishwasherModeBehavior is the base class for objects that support interaction with {@link DishwasherMode.Cluster}.
 */
export const DishwasherModeBehaviorConstructor = ClusterBehavior.for(DishwasherMode);

export interface DishwasherModeBehaviorConstructor extends Identity<typeof DishwasherModeBehaviorConstructor> {}
export const DishwasherModeBehavior: DishwasherModeBehaviorConstructor = DishwasherModeBehaviorConstructor;
export interface DishwasherModeBehavior extends InstanceType<DishwasherModeBehaviorConstructor> {}
export namespace DishwasherModeBehavior {
    export interface State extends InstanceType<typeof DishwasherModeBehavior.State> {}
}
