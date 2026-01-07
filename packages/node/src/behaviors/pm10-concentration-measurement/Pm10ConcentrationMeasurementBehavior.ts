/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Pm10ConcentrationMeasurement } from "#clusters/pm10-concentration-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * Pm10ConcentrationMeasurementBehavior is the base class for objects that support interaction with
 * {@link Pm10ConcentrationMeasurement.Cluster}.
 *
 * Pm10ConcentrationMeasurement.Cluster requires you to enable one or more optional features. You can do so using
 * {@link Pm10ConcentrationMeasurementBehavior.with}.
 */
export const Pm10ConcentrationMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(Pm10ConcentrationMeasurement.Base));

export interface Pm10ConcentrationMeasurementBehaviorConstructor extends Identity<typeof Pm10ConcentrationMeasurementBehaviorConstructor> {}
export const Pm10ConcentrationMeasurementBehavior: Pm10ConcentrationMeasurementBehaviorConstructor = Pm10ConcentrationMeasurementBehaviorConstructor;
export interface Pm10ConcentrationMeasurementBehavior extends InstanceType<Pm10ConcentrationMeasurementBehaviorConstructor> {}
export namespace Pm10ConcentrationMeasurementBehavior {
    export interface State extends InstanceType<typeof Pm10ConcentrationMeasurementBehavior.State> {}
}
