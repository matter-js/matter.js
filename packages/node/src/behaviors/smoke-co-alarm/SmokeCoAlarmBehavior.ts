/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SmokeCoAlarm } from "@matter/types/clusters/smoke-co-alarm";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * SmokeCoAlarmBehavior is the base class for objects that support interaction with {@link SmokeCoAlarm.Cluster}.
 *
 * SmokeCoAlarm.Cluster requires you to enable one or more optional features. You can do so using
 * {@link SmokeCoAlarmBehavior.with}.
 */
export const SmokeCoAlarmBehaviorConstructor = ClusterBehavior.for(SmokeCoAlarm);

export interface SmokeCoAlarmBehaviorConstructor extends Identity<typeof SmokeCoAlarmBehaviorConstructor> {}
export const SmokeCoAlarmBehavior: SmokeCoAlarmBehaviorConstructor = SmokeCoAlarmBehaviorConstructor;
export interface SmokeCoAlarmBehavior extends InstanceType<SmokeCoAlarmBehaviorConstructor> {}
export namespace SmokeCoAlarmBehavior { export interface State extends InstanceType<typeof SmokeCoAlarmBehavior.State> {} }
