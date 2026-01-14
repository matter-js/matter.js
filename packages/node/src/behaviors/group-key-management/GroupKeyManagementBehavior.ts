/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { GroupKeyManagement } from "#clusters/group-key-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { GroupKeyManagementInterface } from "./GroupKeyManagementInterface.js";
import { Identity } from "#general";

/**
 * GroupKeyManagementBehavior is the base class for objects that support interaction with
 * {@link GroupKeyManagement.Cluster}.
 */
export const GroupKeyManagementBehaviorConstructor = ClusterBehavior
    .withInterface<GroupKeyManagementInterface>()
    .for(GroupKeyManagement.Cluster);

export interface GroupKeyManagementBehaviorConstructor extends Identity<typeof GroupKeyManagementBehaviorConstructor> {}
export const GroupKeyManagementBehavior: GroupKeyManagementBehaviorConstructor = GroupKeyManagementBehaviorConstructor;
export interface GroupKeyManagementBehavior extends InstanceType<GroupKeyManagementBehaviorConstructor> {}
export namespace GroupKeyManagementBehavior {
    export interface State extends InstanceType<typeof GroupKeyManagementBehavior.State> {}
}
