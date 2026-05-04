/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClosureDimension } from "@matter/types/clusters/closure-dimension";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * ClosureDimensionBehavior is the base class for objects that support interaction with
 * {@link ClosureDimension.Cluster}.
 *
 * ClosureDimension.Cluster requires you to enable one or more optional features. You can do so using
 * {@link ClosureDimensionBehavior.with}.
 */
export const ClosureDimensionBehaviorConstructor = ClusterBehavior.for(ClosureDimension);

export interface ClosureDimensionBehaviorConstructor extends Identity<typeof ClosureDimensionBehaviorConstructor> {}
export const ClosureDimensionBehavior: ClosureDimensionBehaviorConstructor = ClosureDimensionBehaviorConstructor;
export interface ClosureDimensionBehavior extends InstanceType<ClosureDimensionBehaviorConstructor> {}
export namespace ClosureDimensionBehavior {
    export interface State extends InstanceType<typeof ClosureDimensionBehavior.State> {}
}
