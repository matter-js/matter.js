/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Pm25ConcentrationMeasurement } from "#clusters/pm25-concentration-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * Pm25ConcentrationMeasurementBehavior is the base class for objects that support interaction with
 * {@link Pm25ConcentrationMeasurement.Cluster}.
 *
 * Pm25ConcentrationMeasurement.Cluster requires you to enable one or more optional features. You can do so using
 * {@link Pm25ConcentrationMeasurementBehavior.with}.
 */
export const Pm25ConcentrationMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(Pm25ConcentrationMeasurement.Base));

export interface Pm25ConcentrationMeasurementBehaviorConstructor extends Identity<typeof Pm25ConcentrationMeasurementBehaviorConstructor> {}
export const Pm25ConcentrationMeasurementBehavior: Pm25ConcentrationMeasurementBehaviorConstructor = Pm25ConcentrationMeasurementBehaviorConstructor;
export interface Pm25ConcentrationMeasurementBehavior extends InstanceType<Pm25ConcentrationMeasurementBehaviorConstructor> {}
export namespace Pm25ConcentrationMeasurementBehavior {
    export interface State extends InstanceType<typeof Pm25ConcentrationMeasurementBehavior.State> {}
}
