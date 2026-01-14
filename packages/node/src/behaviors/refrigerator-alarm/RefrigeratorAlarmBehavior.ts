/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RefrigeratorAlarm } from "#clusters/refrigerator-alarm";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { RefrigeratorAlarmInterface } from "./RefrigeratorAlarmInterface.js";
import { Identity } from "#general";

/**
 * RefrigeratorAlarmBehavior is the base class for objects that support interaction with
 * {@link RefrigeratorAlarm.Cluster}.
 *
 * This class does not have optional features of RefrigeratorAlarm.Cluster enabled. You can enable additional features
 * using RefrigeratorAlarmBehavior.with.
 */
export const RefrigeratorAlarmBehaviorConstructor = ClusterBehavior
    .withInterface<RefrigeratorAlarmInterface>()
    .for(RefrigeratorAlarm.Cluster);

export interface RefrigeratorAlarmBehaviorConstructor extends Identity<typeof RefrigeratorAlarmBehaviorConstructor> {}
export const RefrigeratorAlarmBehavior: RefrigeratorAlarmBehaviorConstructor = RefrigeratorAlarmBehaviorConstructor;
export interface RefrigeratorAlarmBehavior extends InstanceType<RefrigeratorAlarmBehaviorConstructor> {}
export namespace RefrigeratorAlarmBehavior {
    export interface State extends InstanceType<typeof RefrigeratorAlarmBehavior.State> {}
}
