/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";
import { Groupcast } from "@matter/types/clusters/groupcast";

export const GroupcastClientConstructor = ClientBehavior(Groupcast.Complete);
export interface GroupcastClient extends InstanceType<typeof GroupcastClientConstructor> {}
export interface GroupcastClientConstructor extends Identity<typeof GroupcastClientConstructor> {}
export const GroupcastClient: GroupcastClientConstructor = GroupcastClientConstructor;
