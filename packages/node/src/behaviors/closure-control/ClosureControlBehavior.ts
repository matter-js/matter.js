/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClosureControl } from "@matter/types/clusters/closure-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClosureControlInterface } from "./ClosureControlInterface.js";
import { ClusterType } from "@matter/types";
import { Identity } from "@matter/general";

/**
 * ClosureControlBehavior is the base class for objects that support interaction with {@link ClosureControl.Cluster}.
 *
 * ClosureControl.Cluster requires you to enable one or more optional features. You can do so using
 * {@link ClosureControlBehavior.with}.
 */
export const ClosureControlBehaviorConstructor = ClusterBehavior
    .withInterface<ClosureControlInterface>()
    .for(ClusterType(ClosureControl.Base));

export interface ClosureControlBehaviorConstructor extends Identity<typeof ClosureControlBehaviorConstructor> {}
export const ClosureControlBehavior: ClosureControlBehaviorConstructor = ClosureControlBehaviorConstructor;
export interface ClosureControlBehavior extends InstanceType<ClosureControlBehaviorConstructor> {}
export namespace ClosureControlBehavior {
    export interface State extends InstanceType<typeof ClosureControlBehavior.State> {}
}
