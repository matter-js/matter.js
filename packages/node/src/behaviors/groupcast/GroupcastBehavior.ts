/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Groupcast } from "@matter/types/clusters/groupcast";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * GroupcastBehavior is the base class for objects that support interaction with {@link Groupcast.Cluster}.
 *
 * This class does not have optional features of Groupcast.Cluster enabled. You can enable additional features using
 * GroupcastBehavior.with.
 */
export const GroupcastBehaviorConstructor = ClusterBehavior.for(Groupcast);

export interface GroupcastBehaviorConstructor extends Identity<typeof GroupcastBehaviorConstructor> {}
export const GroupcastBehavior: GroupcastBehaviorConstructor = GroupcastBehaviorConstructor;
export interface GroupcastBehavior extends InstanceType<GroupcastBehaviorConstructor> {}
export namespace GroupcastBehavior { export interface State extends InstanceType<typeof GroupcastBehavior.State> {} }
