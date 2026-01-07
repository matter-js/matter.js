/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RadonConcentrationMeasurement } from "#clusters/radon-concentration-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * RadonConcentrationMeasurementBehavior is the base class for objects that support interaction with
 * {@link RadonConcentrationMeasurement.Cluster}.
 *
 * RadonConcentrationMeasurement.Cluster requires you to enable one or more optional features. You can do so using
 * {@link RadonConcentrationMeasurementBehavior.with}.
 */
export const RadonConcentrationMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(RadonConcentrationMeasurement.Base));

export interface RadonConcentrationMeasurementBehaviorConstructor extends Identity<typeof RadonConcentrationMeasurementBehaviorConstructor> {}
export const RadonConcentrationMeasurementBehavior: RadonConcentrationMeasurementBehaviorConstructor = RadonConcentrationMeasurementBehaviorConstructor;
export interface RadonConcentrationMeasurementBehavior extends InstanceType<RadonConcentrationMeasurementBehaviorConstructor> {}
export namespace RadonConcentrationMeasurementBehavior {
    export interface State extends InstanceType<typeof RadonConcentrationMeasurementBehavior.State> {}
}
