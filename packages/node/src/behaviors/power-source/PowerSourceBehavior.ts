/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PowerSource } from "#clusters/power-source";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * PowerSourceBehavior is the base class for objects that support interaction with {@link PowerSource.Cluster}.
 *
 * PowerSource.Cluster requires you to enable one or more optional features. You can do so using
 * {@link PowerSourceBehavior.with}.
 */
export const PowerSourceBehaviorConstructor = ClusterBehavior.for(ClusterType(PowerSource.Base));

export interface PowerSourceBehaviorConstructor extends Identity<typeof PowerSourceBehaviorConstructor> {}
export const PowerSourceBehavior: PowerSourceBehaviorConstructor = PowerSourceBehaviorConstructor;
export interface PowerSourceBehavior extends InstanceType<PowerSourceBehaviorConstructor> {}
export namespace PowerSourceBehavior { export interface State extends InstanceType<typeof PowerSourceBehavior.State> {} }
