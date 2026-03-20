/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TargetNavigator } from "@matter/types/clusters/target-navigator";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * TargetNavigatorBehavior is the base class for objects that support interaction with {@link TargetNavigator.Cluster}.
 */
export const TargetNavigatorBehaviorConstructor = ClusterBehavior.for(TargetNavigator);

export interface TargetNavigatorBehaviorConstructor extends Identity<typeof TargetNavigatorBehaviorConstructor> {}
export const TargetNavigatorBehavior: TargetNavigatorBehaviorConstructor = TargetNavigatorBehaviorConstructor;
export interface TargetNavigatorBehavior extends InstanceType<TargetNavigatorBehaviorConstructor> {}
export namespace TargetNavigatorBehavior {
    export interface State extends InstanceType<typeof TargetNavigatorBehavior.State> {}
}
