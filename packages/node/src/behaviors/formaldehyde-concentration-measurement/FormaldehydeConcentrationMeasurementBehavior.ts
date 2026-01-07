/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FormaldehydeConcentrationMeasurement } from "#clusters/formaldehyde-concentration-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * FormaldehydeConcentrationMeasurementBehavior is the base class for objects that support interaction with
 * {@link FormaldehydeConcentrationMeasurement.Cluster}.
 *
 * FormaldehydeConcentrationMeasurement.Cluster requires you to enable one or more optional features. You can do so
 * using {@link FormaldehydeConcentrationMeasurementBehavior.with}.
 */
export const FormaldehydeConcentrationMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(FormaldehydeConcentrationMeasurement.Base));

export interface FormaldehydeConcentrationMeasurementBehaviorConstructor extends Identity<typeof FormaldehydeConcentrationMeasurementBehaviorConstructor> {}
export const FormaldehydeConcentrationMeasurementBehavior: FormaldehydeConcentrationMeasurementBehaviorConstructor = FormaldehydeConcentrationMeasurementBehaviorConstructor;
export interface FormaldehydeConcentrationMeasurementBehavior extends InstanceType<FormaldehydeConcentrationMeasurementBehaviorConstructor> {}
export namespace FormaldehydeConcentrationMeasurementBehavior {
    export interface State extends InstanceType<typeof FormaldehydeConcentrationMeasurementBehavior.State> {}
}
