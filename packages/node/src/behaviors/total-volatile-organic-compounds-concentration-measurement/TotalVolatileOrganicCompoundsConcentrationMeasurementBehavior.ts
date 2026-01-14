/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    TotalVolatileOrganicCompoundsConcentrationMeasurement
} from "#clusters/total-volatile-organic-compounds-concentration-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * TotalVolatileOrganicCompoundsConcentrationMeasurementBehavior is the base class for objects that support interaction
 * with {@link TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster}.
 *
 * TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster requires you to enable one or more optional features.
 * You can do so using {@link TotalVolatileOrganicCompoundsConcentrationMeasurementBehavior.with}.
 */
export const TotalVolatileOrganicCompoundsConcentrationMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(TotalVolatileOrganicCompoundsConcentrationMeasurement.Base));

export interface TotalVolatileOrganicCompoundsConcentrationMeasurementBehaviorConstructor extends Identity<typeof TotalVolatileOrganicCompoundsConcentrationMeasurementBehaviorConstructor> {}
export const TotalVolatileOrganicCompoundsConcentrationMeasurementBehavior: TotalVolatileOrganicCompoundsConcentrationMeasurementBehaviorConstructor = TotalVolatileOrganicCompoundsConcentrationMeasurementBehaviorConstructor;
export interface TotalVolatileOrganicCompoundsConcentrationMeasurementBehavior extends InstanceType<TotalVolatileOrganicCompoundsConcentrationMeasurementBehaviorConstructor> {}
export namespace TotalVolatileOrganicCompoundsConcentrationMeasurementBehavior {
    export interface State extends InstanceType<typeof TotalVolatileOrganicCompoundsConcentrationMeasurementBehavior.State> {}
}
