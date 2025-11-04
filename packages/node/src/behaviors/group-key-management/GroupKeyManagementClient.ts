/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { GroupKeyManagement } from "#clusters/group-key-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const GroupKeyManagementClientConstructor = ClientBehavior(GroupKeyManagement.Complete);
export interface GroupKeyManagementClient extends InstanceType<typeof GroupKeyManagementClientConstructor> {}
export interface GroupKeyManagementClientConstructor extends Identity<typeof GroupKeyManagementClientConstructor> {}
export const GroupKeyManagementClient: GroupKeyManagementClientConstructor = GroupKeyManagementClientConstructor;
