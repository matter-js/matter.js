/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TargetNavigator } from "#clusters/target-navigator";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { TargetNavigatorInterface } from "./TargetNavigatorInterface.js";
import { Identity } from "#general";

/**
 * TargetNavigatorBehavior is the base class for objects that support interaction with {@link TargetNavigator.Cluster}.
 */
export const TargetNavigatorBehaviorConstructor = ClusterBehavior
    .withInterface<TargetNavigatorInterface>()
    .for(TargetNavigator.Cluster);

export interface TargetNavigatorBehaviorConstructor extends Identity<typeof TargetNavigatorBehaviorConstructor> {}
export const TargetNavigatorBehavior: TargetNavigatorBehaviorConstructor = TargetNavigatorBehaviorConstructor;
export interface TargetNavigatorBehavior extends InstanceType<TargetNavigatorBehaviorConstructor> {}
export namespace TargetNavigatorBehavior {
    export interface State extends InstanceType<typeof TargetNavigatorBehavior.State> {}
}
