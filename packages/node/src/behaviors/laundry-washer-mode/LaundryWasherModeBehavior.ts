/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LaundryWasherMode } from "#clusters/laundry-washer-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { LaundryWasherModeInterface } from "./LaundryWasherModeInterface.js";
import { Identity } from "#general";

/**
 * LaundryWasherModeBehavior is the base class for objects that support interaction with
 * {@link LaundryWasherMode.Cluster}.
 */
export const LaundryWasherModeBehaviorConstructor = ClusterBehavior
    .withInterface<LaundryWasherModeInterface>()
    .for(LaundryWasherMode.Cluster);

export interface LaundryWasherModeBehaviorConstructor extends Identity<typeof LaundryWasherModeBehaviorConstructor> {}
export const LaundryWasherModeBehavior: LaundryWasherModeBehaviorConstructor = LaundryWasherModeBehaviorConstructor;
export interface LaundryWasherModeBehavior extends InstanceType<LaundryWasherModeBehaviorConstructor> {}
export namespace LaundryWasherModeBehavior {
    export interface State extends InstanceType<typeof LaundryWasherModeBehavior.State> {}
}
