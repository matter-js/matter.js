/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DishwasherAlarm } from "#clusters/dishwasher-alarm";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { DishwasherAlarmInterface } from "./DishwasherAlarmInterface.js";
import { Identity } from "#general";

/**
 * DishwasherAlarmBehavior is the base class for objects that support interaction with {@link DishwasherAlarm.Cluster}.
 *
 * This class does not have optional features of DishwasherAlarm.Cluster enabled. You can enable additional features
 * using DishwasherAlarmBehavior.with.
 */
export const DishwasherAlarmBehaviorConstructor = ClusterBehavior
    .withInterface<DishwasherAlarmInterface>()
    .for(DishwasherAlarm.Cluster);

export interface DishwasherAlarmBehaviorConstructor extends Identity<typeof DishwasherAlarmBehaviorConstructor> {}
export const DishwasherAlarmBehavior: DishwasherAlarmBehaviorConstructor = DishwasherAlarmBehaviorConstructor;
export interface DishwasherAlarmBehavior extends InstanceType<DishwasherAlarmBehaviorConstructor> {}
export namespace DishwasherAlarmBehavior {
    export interface State extends InstanceType<typeof DishwasherAlarmBehavior.State> {}
}
