/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { HepaFilterMonitoring } from "#clusters/hepa-filter-monitoring";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ResourceMonitoringInterface } from "../resource-monitoring/ResourceMonitoringInterface.js";
import { Identity } from "#general";

/**
 * HepaFilterMonitoringBehavior is the base class for objects that support interaction with
 * {@link HepaFilterMonitoring.Cluster}.
 *
 * This class does not have optional features of HepaFilterMonitoring.Cluster enabled. You can enable additional
 * features using HepaFilterMonitoringBehavior.with.
 */
export const HepaFilterMonitoringBehaviorConstructor = ClusterBehavior
    .withInterface<ResourceMonitoringInterface>()
    .for(HepaFilterMonitoring.Cluster);

export interface HepaFilterMonitoringBehaviorConstructor extends Identity<typeof HepaFilterMonitoringBehaviorConstructor> {}
export const HepaFilterMonitoringBehavior: HepaFilterMonitoringBehaviorConstructor = HepaFilterMonitoringBehaviorConstructor;
export interface HepaFilterMonitoringBehavior extends InstanceType<HepaFilterMonitoringBehaviorConstructor> {}
export namespace HepaFilterMonitoringBehavior {
    export interface State extends InstanceType<typeof HepaFilterMonitoringBehavior.State> {}
}
