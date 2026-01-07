/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CarbonMonoxideConcentrationMeasurement } from "#clusters/carbon-monoxide-concentration-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * CarbonMonoxideConcentrationMeasurementBehavior is the base class for objects that support interaction with
 * {@link CarbonMonoxideConcentrationMeasurement.Cluster}.
 *
 * CarbonMonoxideConcentrationMeasurement.Cluster requires you to enable one or more optional features. You can do so
 * using {@link CarbonMonoxideConcentrationMeasurementBehavior.with}.
 */
export const CarbonMonoxideConcentrationMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(CarbonMonoxideConcentrationMeasurement.Base));

export interface CarbonMonoxideConcentrationMeasurementBehaviorConstructor extends Identity<typeof CarbonMonoxideConcentrationMeasurementBehaviorConstructor> {}
export const CarbonMonoxideConcentrationMeasurementBehavior: CarbonMonoxideConcentrationMeasurementBehaviorConstructor = CarbonMonoxideConcentrationMeasurementBehaviorConstructor;
export interface CarbonMonoxideConcentrationMeasurementBehavior extends InstanceType<CarbonMonoxideConcentrationMeasurementBehaviorConstructor> {}
export namespace CarbonMonoxideConcentrationMeasurementBehavior {
    export interface State extends InstanceType<typeof CarbonMonoxideConcentrationMeasurementBehavior.State> {}
}
