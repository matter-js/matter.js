/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LaundryWasherControls } from "@matter/types/clusters/laundry-washer-controls";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "@matter/types";
import { Identity } from "@matter/general";

/**
 * LaundryWasherControlsBehavior is the base class for objects that support interaction with
 * {@link LaundryWasherControls.Cluster}.
 *
 * LaundryWasherControls.Cluster requires you to enable one or more optional features. You can do so using
 * {@link LaundryWasherControlsBehavior.with}.
 */
export const LaundryWasherControlsBehaviorConstructor = ClusterBehavior.for(ClusterType(LaundryWasherControls.Base));

export interface LaundryWasherControlsBehaviorConstructor extends Identity<typeof LaundryWasherControlsBehaviorConstructor> {}
export const LaundryWasherControlsBehavior: LaundryWasherControlsBehaviorConstructor = LaundryWasherControlsBehaviorConstructor;
export interface LaundryWasherControlsBehavior extends InstanceType<LaundryWasherControlsBehaviorConstructor> {}
export namespace LaundryWasherControlsBehavior {
    export interface State extends InstanceType<typeof LaundryWasherControlsBehavior.State> {}
}
