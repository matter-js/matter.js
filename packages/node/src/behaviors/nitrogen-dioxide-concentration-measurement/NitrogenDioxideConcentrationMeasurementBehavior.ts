/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { NitrogenDioxideConcentrationMeasurement } from "#clusters/nitrogen-dioxide-concentration-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * NitrogenDioxideConcentrationMeasurementBehavior is the base class for objects that support interaction with
 * {@link NitrogenDioxideConcentrationMeasurement.Cluster}.
 *
 * NitrogenDioxideConcentrationMeasurement.Cluster requires you to enable one or more optional features. You can do so
 * using {@link NitrogenDioxideConcentrationMeasurementBehavior.with}.
 */
export const NitrogenDioxideConcentrationMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(NitrogenDioxideConcentrationMeasurement.Base));

export interface NitrogenDioxideConcentrationMeasurementBehaviorConstructor extends Identity<typeof NitrogenDioxideConcentrationMeasurementBehaviorConstructor> {}
export const NitrogenDioxideConcentrationMeasurementBehavior: NitrogenDioxideConcentrationMeasurementBehaviorConstructor = NitrogenDioxideConcentrationMeasurementBehaviorConstructor;
export interface NitrogenDioxideConcentrationMeasurementBehavior extends InstanceType<NitrogenDioxideConcentrationMeasurementBehaviorConstructor> {}
export namespace NitrogenDioxideConcentrationMeasurementBehavior {
    export interface State extends InstanceType<typeof NitrogenDioxideConcentrationMeasurementBehavior.State> {}
}
