/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ZoneManagement } from "@matter/types/clusters/zone-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const ZoneManagementClientConstructor = ClientBehavior(ZoneManagement);
export interface ZoneManagementClient extends InstanceType<typeof ZoneManagementClientConstructor> {}
export interface ZoneManagementClientConstructor extends Identity<typeof ZoneManagementClientConstructor> {}
export const ZoneManagementClient: ZoneManagementClientConstructor = ZoneManagementClientConstructor;
