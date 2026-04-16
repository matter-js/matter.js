/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Groups } from "@matter/types/clusters/groups";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const GroupsClientConstructor = ClientBehavior(Groups);
export interface GroupsClient extends InstanceType<typeof GroupsClientConstructor> {}
export interface GroupsClientConstructor extends Identity<typeof GroupsClientConstructor> {}
export const GroupsClient: GroupsClientConstructor = GroupsClientConstructor;
