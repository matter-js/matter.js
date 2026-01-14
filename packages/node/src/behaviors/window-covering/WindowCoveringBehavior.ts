/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WindowCovering } from "#clusters/window-covering";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { WindowCoveringInterface } from "./WindowCoveringInterface.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * WindowCoveringBehavior is the base class for objects that support interaction with {@link WindowCovering.Cluster}.
 *
 * WindowCovering.Cluster requires you to enable one or more optional features. You can do so using
 * {@link WindowCoveringBehavior.with}.
 */
export const WindowCoveringBehaviorConstructor = ClusterBehavior
    .withInterface<WindowCoveringInterface>()
    .for(ClusterType(WindowCovering.Base));

export interface WindowCoveringBehaviorConstructor extends Identity<typeof WindowCoveringBehaviorConstructor> {}
export const WindowCoveringBehavior: WindowCoveringBehaviorConstructor = WindowCoveringBehaviorConstructor;
export interface WindowCoveringBehavior extends InstanceType<WindowCoveringBehaviorConstructor> {}
export namespace WindowCoveringBehavior {
    export interface State extends InstanceType<typeof WindowCoveringBehavior.State> {}
}
