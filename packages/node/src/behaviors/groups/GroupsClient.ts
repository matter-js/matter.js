/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Groups } from "#clusters/groups";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const GroupsClientConstructor = ClientBehavior(Groups.Complete);
export interface GroupsClient extends InstanceType<typeof GroupsClientConstructor> {}
export interface GroupsClientConstructor extends Identity<typeof GroupsClientConstructor> {}
export const GroupsClient: GroupsClientConstructor = GroupsClientConstructor;
