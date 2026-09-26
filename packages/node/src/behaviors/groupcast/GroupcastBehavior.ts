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
 * Groupcast.Cluster requires you to enable one or more optional features. You can do so using
 * {@link GroupcastBehavior.with}.
 */
export const GroupcastBehaviorConstructor = ClusterBehavior.for(Groupcast);

export interface GroupcastBehaviorConstructor extends Identity<typeof GroupcastBehaviorConstructor> {}
export const GroupcastBehavior: GroupcastBehaviorConstructor = GroupcastBehaviorConstructor;
export interface GroupcastBehavior extends InstanceType<GroupcastBehaviorConstructor> {}
export namespace GroupcastBehavior { export interface State extends InstanceType<typeof GroupcastBehavior.State> {} }
