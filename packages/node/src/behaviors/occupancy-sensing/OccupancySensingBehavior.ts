/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OccupancySensing } from "#clusters/occupancy-sensing";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * OccupancySensingBehavior is the base class for objects that support interaction with
 * {@link OccupancySensing.Cluster}.
 *
 * OccupancySensing.Cluster requires you to enable one or more optional features. You can do so using
 * {@link OccupancySensingBehavior.with}.
 */
export const OccupancySensingBehaviorConstructor = ClusterBehavior.for(ClusterType(OccupancySensing.Base));

export interface OccupancySensingBehaviorConstructor extends Identity<typeof OccupancySensingBehaviorConstructor> {}
export const OccupancySensingBehavior: OccupancySensingBehaviorConstructor = OccupancySensingBehaviorConstructor;
export interface OccupancySensingBehavior extends InstanceType<OccupancySensingBehaviorConstructor> {}
export namespace OccupancySensingBehavior {
    export interface State extends InstanceType<typeof OccupancySensingBehavior.State> {}
}
