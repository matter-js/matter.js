/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ElectricalEnergyMeasurement } from "#clusters/electrical-energy-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * ElectricalEnergyMeasurementBehavior is the base class for objects that support interaction with
 * {@link ElectricalEnergyMeasurement.Cluster}.
 *
 * ElectricalEnergyMeasurement.Cluster requires you to enable one or more optional features. You can do so using
 * {@link ElectricalEnergyMeasurementBehavior.with}.
 */
export const ElectricalEnergyMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(ElectricalEnergyMeasurement.Base));

export interface ElectricalEnergyMeasurementBehaviorConstructor extends Identity<typeof ElectricalEnergyMeasurementBehaviorConstructor> {}
export const ElectricalEnergyMeasurementBehavior: ElectricalEnergyMeasurementBehaviorConstructor = ElectricalEnergyMeasurementBehaviorConstructor;
export interface ElectricalEnergyMeasurementBehavior extends InstanceType<ElectricalEnergyMeasurementBehaviorConstructor> {}
export namespace ElectricalEnergyMeasurementBehavior {
    export interface State extends InstanceType<typeof ElectricalEnergyMeasurementBehavior.State> {}
}
