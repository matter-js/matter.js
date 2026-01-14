/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Groups } from "#clusters/groups";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { GroupsInterface } from "./GroupsInterface.js";
import { Identity } from "#general";

/**
 * GroupsBehavior is the base class for objects that support interaction with {@link Groups.Cluster}.
 */
export const GroupsBehaviorConstructor = ClusterBehavior
    .withInterface<GroupsInterface>()
    .for(Groups.Cluster);

export interface GroupsBehaviorConstructor extends Identity<typeof GroupsBehaviorConstructor> {}
export const GroupsBehavior: GroupsBehaviorConstructor = GroupsBehaviorConstructor;
export interface GroupsBehavior extends InstanceType<GroupsBehaviorConstructor> {}
export namespace GroupsBehavior { export interface State extends InstanceType<typeof GroupsBehavior.State> {} }
