/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { GroupcastInterface } from "./GroupcastInterface.js";
import { Identity } from "@matter/general";
import { ClusterType } from "@matter/types";
import { Groupcast } from "@matter/types/clusters/groupcast";

/**
 * GroupcastBehavior is the base class for objects that support interaction with {@link Groupcast.Cluster}.
 *
 * Groupcast.Cluster requires you to enable one or more optional features. You can do so using
 * {@link GroupcastBehavior.with}.
 */
export const GroupcastBehaviorConstructor = ClusterBehavior
    .withInterface<GroupcastInterface>()
    .for(ClusterType(Groupcast.Base));

export interface GroupcastBehaviorConstructor extends Identity<typeof GroupcastBehaviorConstructor> {}
export const GroupcastBehavior: GroupcastBehaviorConstructor = GroupcastBehaviorConstructor;
export interface GroupcastBehavior extends InstanceType<GroupcastBehaviorConstructor> {}
export namespace GroupcastBehavior { export interface State extends InstanceType<typeof GroupcastBehavior.State> {} }
