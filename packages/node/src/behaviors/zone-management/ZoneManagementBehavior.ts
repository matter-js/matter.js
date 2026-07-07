/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ZoneManagement } from "@matter/types/clusters/zone-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * ZoneManagementBehavior is the base class for objects that support interaction with {@link ZoneManagement.Cluster}.
 *
 * This class does not have optional features of ZoneManagement.Cluster enabled. You can enable additional features
 * using ZoneManagementBehavior.with.
 */
export const ZoneManagementBehaviorConstructor = ClusterBehavior.for(ZoneManagement);

export interface ZoneManagementBehaviorConstructor extends Identity<typeof ZoneManagementBehaviorConstructor> {}
export const ZoneManagementBehavior: ZoneManagementBehaviorConstructor = ZoneManagementBehaviorConstructor;
export interface ZoneManagementBehavior extends InstanceType<ZoneManagementBehaviorConstructor> {}
export namespace ZoneManagementBehavior {
    export interface State extends InstanceType<typeof ZoneManagementBehavior.State> {}
}
