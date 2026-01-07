/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LaundryDryerControls } from "#clusters/laundry-dryer-controls";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * LaundryDryerControlsBehavior is the base class for objects that support interaction with
 * {@link LaundryDryerControls.Cluster}.
 */
export const LaundryDryerControlsBehaviorConstructor = ClusterBehavior.for(LaundryDryerControls.Cluster);

export interface LaundryDryerControlsBehaviorConstructor extends Identity<typeof LaundryDryerControlsBehaviorConstructor> {}
export const LaundryDryerControlsBehavior: LaundryDryerControlsBehaviorConstructor = LaundryDryerControlsBehaviorConstructor;
export interface LaundryDryerControlsBehavior extends InstanceType<LaundryDryerControlsBehaviorConstructor> {}
export namespace LaundryDryerControlsBehavior {
    export interface State extends InstanceType<typeof LaundryDryerControlsBehavior.State> {}
}
