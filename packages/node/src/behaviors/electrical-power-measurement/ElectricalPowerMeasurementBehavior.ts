/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ElectricalPowerMeasurement } from "#clusters/electrical-power-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * ElectricalPowerMeasurementBehavior is the base class for objects that support interaction with
 * {@link ElectricalPowerMeasurement.Cluster}.
 *
 * ElectricalPowerMeasurement.Cluster requires you to enable one or more optional features. You can do so using
 * {@link ElectricalPowerMeasurementBehavior.with}.
 */
export const ElectricalPowerMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(ElectricalPowerMeasurement.Base));

export interface ElectricalPowerMeasurementBehaviorConstructor extends Identity<typeof ElectricalPowerMeasurementBehaviorConstructor> {}
export const ElectricalPowerMeasurementBehavior: ElectricalPowerMeasurementBehaviorConstructor = ElectricalPowerMeasurementBehaviorConstructor;
export interface ElectricalPowerMeasurementBehavior extends InstanceType<ElectricalPowerMeasurementBehaviorConstructor> {}
export namespace ElectricalPowerMeasurementBehavior {
    export interface State extends InstanceType<typeof ElectricalPowerMeasurementBehavior.State> {}
}
