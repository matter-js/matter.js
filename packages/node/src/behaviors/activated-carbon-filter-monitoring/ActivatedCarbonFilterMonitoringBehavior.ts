/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ActivatedCarbonFilterMonitoring } from "#clusters/activated-carbon-filter-monitoring";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ResourceMonitoringInterface } from "../resource-monitoring/ResourceMonitoringInterface.js";
import { Identity } from "#general";

/**
 * ActivatedCarbonFilterMonitoringBehavior is the base class for objects that support interaction with
 * {@link ActivatedCarbonFilterMonitoring.Cluster}.
 *
 * This class does not have optional features of ActivatedCarbonFilterMonitoring.Cluster enabled. You can enable
 * additional features using ActivatedCarbonFilterMonitoringBehavior.with.
 */
export const ActivatedCarbonFilterMonitoringBehaviorConstructor = ClusterBehavior
    .withInterface<ResourceMonitoringInterface>()
    .for(ActivatedCarbonFilterMonitoring.Cluster);

export interface ActivatedCarbonFilterMonitoringBehaviorConstructor extends Identity<typeof ActivatedCarbonFilterMonitoringBehaviorConstructor> {}
export const ActivatedCarbonFilterMonitoringBehavior: ActivatedCarbonFilterMonitoringBehaviorConstructor = ActivatedCarbonFilterMonitoringBehaviorConstructor;
export interface ActivatedCarbonFilterMonitoringBehavior extends InstanceType<ActivatedCarbonFilterMonitoringBehaviorConstructor> {}
export namespace ActivatedCarbonFilterMonitoringBehavior {
    export interface State extends InstanceType<typeof ActivatedCarbonFilterMonitoringBehavior.State> {}
}
