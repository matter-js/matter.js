/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Pm1ConcentrationMeasurement } from "#clusters/pm1-concentration-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * Pm1ConcentrationMeasurementBehavior is the base class for objects that support interaction with
 * {@link Pm1ConcentrationMeasurement.Cluster}.
 *
 * Pm1ConcentrationMeasurement.Cluster requires you to enable one or more optional features. You can do so using
 * {@link Pm1ConcentrationMeasurementBehavior.with}.
 */
export const Pm1ConcentrationMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(Pm1ConcentrationMeasurement.Base));

export interface Pm1ConcentrationMeasurementBehaviorConstructor extends Identity<typeof Pm1ConcentrationMeasurementBehaviorConstructor> {}
export const Pm1ConcentrationMeasurementBehavior: Pm1ConcentrationMeasurementBehaviorConstructor = Pm1ConcentrationMeasurementBehaviorConstructor;
export interface Pm1ConcentrationMeasurementBehavior extends InstanceType<Pm1ConcentrationMeasurementBehaviorConstructor> {}
export namespace Pm1ConcentrationMeasurementBehavior {
    export interface State extends InstanceType<typeof Pm1ConcentrationMeasurementBehavior.State> {}
}
