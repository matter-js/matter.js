/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TemperatureAlarm } from "@matter/types/clusters/temperature-alarm";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * TemperatureAlarmBehavior is the base class for objects that support interaction with
 * {@link TemperatureAlarm.Cluster}.
 *
 * TemperatureAlarm.Cluster requires you to enable one or more optional features. You can do so using
 * {@link TemperatureAlarmBehavior.with}.
 */
export const TemperatureAlarmBehaviorConstructor = ClusterBehavior.for(TemperatureAlarm);

export interface TemperatureAlarmBehaviorConstructor extends Identity<typeof TemperatureAlarmBehaviorConstructor> {}
export const TemperatureAlarmBehavior: TemperatureAlarmBehaviorConstructor = TemperatureAlarmBehaviorConstructor;
export interface TemperatureAlarmBehavior extends InstanceType<TemperatureAlarmBehaviorConstructor> {}
export namespace TemperatureAlarmBehavior {
    export interface State extends InstanceType<typeof TemperatureAlarmBehavior.State> {}
}
