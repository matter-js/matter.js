/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SmokeCoAlarm } from "#clusters/smoke-co-alarm";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { SmokeCoAlarmInterface } from "./SmokeCoAlarmInterface.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * SmokeCoAlarmBehavior is the base class for objects that support interaction with {@link SmokeCoAlarm.Cluster}.
 *
 * SmokeCoAlarm.Cluster requires you to enable one or more optional features. You can do so using
 * {@link SmokeCoAlarmBehavior.with}.
 */
export const SmokeCoAlarmBehaviorConstructor = ClusterBehavior
    .withInterface<SmokeCoAlarmInterface>()
    .for(ClusterType(SmokeCoAlarm.Base));

export interface SmokeCoAlarmBehaviorConstructor extends Identity<typeof SmokeCoAlarmBehaviorConstructor> {}
export const SmokeCoAlarmBehavior: SmokeCoAlarmBehaviorConstructor = SmokeCoAlarmBehaviorConstructor;
export interface SmokeCoAlarmBehavior extends InstanceType<SmokeCoAlarmBehaviorConstructor> {}
export namespace SmokeCoAlarmBehavior { export interface State extends InstanceType<typeof SmokeCoAlarmBehavior.State> {} }
