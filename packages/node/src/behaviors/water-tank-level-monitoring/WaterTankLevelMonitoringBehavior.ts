/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WaterTankLevelMonitoring } from "#clusters/water-tank-level-monitoring";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ResourceMonitoringInterface } from "../resource-monitoring/ResourceMonitoringInterface.js";
import { Identity } from "#general";

/**
 * WaterTankLevelMonitoringBehavior is the base class for objects that support interaction with
 * {@link WaterTankLevelMonitoring.Cluster}.
 *
 * This class does not have optional features of WaterTankLevelMonitoring.Cluster enabled. You can enable additional
 * features using WaterTankLevelMonitoringBehavior.with.
 */
export const WaterTankLevelMonitoringBehaviorConstructor = ClusterBehavior
    .withInterface<ResourceMonitoringInterface>()
    .for(WaterTankLevelMonitoring.Cluster);

export interface WaterTankLevelMonitoringBehaviorConstructor extends Identity<typeof WaterTankLevelMonitoringBehaviorConstructor> {}
export const WaterTankLevelMonitoringBehavior: WaterTankLevelMonitoringBehaviorConstructor = WaterTankLevelMonitoringBehaviorConstructor;
export interface WaterTankLevelMonitoringBehavior extends InstanceType<WaterTankLevelMonitoringBehaviorConstructor> {}
export namespace WaterTankLevelMonitoringBehavior {
    export interface State extends InstanceType<typeof WaterTankLevelMonitoringBehavior.State> {}
}
