/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ElectricalGridConditions } from "@matter/types/clusters/electrical-grid-conditions";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * ElectricalGridConditionsBehavior is the base class for objects that support interaction with
 * {@link ElectricalGridConditions.Cluster}.
 *
 * This class does not have optional features of ElectricalGridConditions.Cluster enabled. You can enable additional
 * features using ElectricalGridConditionsBehavior.with.
 */
export const ElectricalGridConditionsBehaviorConstructor = ClusterBehavior.for(ElectricalGridConditions);

export interface ElectricalGridConditionsBehaviorConstructor extends Identity<typeof ElectricalGridConditionsBehaviorConstructor> {}
export const ElectricalGridConditionsBehavior: ElectricalGridConditionsBehaviorConstructor = ElectricalGridConditionsBehaviorConstructor;
export interface ElectricalGridConditionsBehavior extends InstanceType<ElectricalGridConditionsBehaviorConstructor> {}
export namespace ElectricalGridConditionsBehavior {
    export interface State extends InstanceType<typeof ElectricalGridConditionsBehavior.State> {}
}
