/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Binding } from "#clusters/binding";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * BindingBehavior is the base class for objects that support interaction with {@link Binding.Cluster}.
 */
export const BindingBehaviorConstructor = ClusterBehavior.for(Binding.Cluster);

export interface BindingBehaviorConstructor extends Identity<typeof BindingBehaviorConstructor> {}
export const BindingBehavior: BindingBehaviorConstructor = BindingBehaviorConstructor;
export interface BindingBehavior extends InstanceType<BindingBehaviorConstructor> {}
export namespace BindingBehavior { export interface State extends InstanceType<typeof BindingBehavior.State> {} }
