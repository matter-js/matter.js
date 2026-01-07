/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PressureMeasurement } from "#clusters/pressure-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * PressureMeasurementBehavior is the base class for objects that support interaction with
 * {@link PressureMeasurement.Cluster}.
 *
 * This class does not have optional features of PressureMeasurement.Cluster enabled. You can enable additional features
 * using PressureMeasurementBehavior.with.
 */
export const PressureMeasurementBehaviorConstructor = ClusterBehavior.for(PressureMeasurement.Cluster);

export interface PressureMeasurementBehaviorConstructor extends Identity<typeof PressureMeasurementBehaviorConstructor> {}
export const PressureMeasurementBehavior: PressureMeasurementBehaviorConstructor = PressureMeasurementBehaviorConstructor;
export interface PressureMeasurementBehavior extends InstanceType<PressureMeasurementBehaviorConstructor> {}
export namespace PressureMeasurementBehavior {
    export interface State extends InstanceType<typeof PressureMeasurementBehavior.State> {}
}
