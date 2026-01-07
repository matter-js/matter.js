/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Descriptor } from "#clusters/descriptor";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * DescriptorBehavior is the base class for objects that support interaction with {@link Descriptor.Cluster}.
 *
 * This class does not have optional features of Descriptor.Cluster enabled. You can enable additional features using
 * DescriptorBehavior.with.
 */
export const DescriptorBehaviorConstructor = ClusterBehavior.for(Descriptor.Cluster);

export interface DescriptorBehaviorConstructor extends Identity<typeof DescriptorBehaviorConstructor> {}
export const DescriptorBehavior: DescriptorBehaviorConstructor = DescriptorBehaviorConstructor;
export interface DescriptorBehavior extends InstanceType<DescriptorBehaviorConstructor> {}
export namespace DescriptorBehavior { export interface State extends InstanceType<typeof DescriptorBehavior.State> {} }
