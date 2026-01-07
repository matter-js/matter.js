/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Switch } from "#clusters/switch";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * SwitchBehavior is the base class for objects that support interaction with {@link Switch.Cluster}.
 *
 * Switch.Cluster requires you to enable one or more optional features. You can do so using {@link SwitchBehavior.with}.
 */
export const SwitchBehaviorConstructor = ClusterBehavior.for(ClusterType(Switch.Base));

export interface SwitchBehaviorConstructor extends Identity<typeof SwitchBehaviorConstructor> {}
export const SwitchBehavior: SwitchBehaviorConstructor = SwitchBehaviorConstructor;
export interface SwitchBehavior extends InstanceType<SwitchBehaviorConstructor> {}
export namespace SwitchBehavior { export interface State extends InstanceType<typeof SwitchBehavior.State> {} }
