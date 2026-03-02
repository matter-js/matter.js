/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CarbonDioxideConcentrationMeasurement } from "@matter/types/clusters/carbon-dioxide-concentration-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "@matter/types";
import { Identity } from "@matter/general";

/**
 * CarbonDioxideConcentrationMeasurementBehavior is the base class for objects that support interaction with
 * {@link CarbonDioxideConcentrationMeasurement.Cluster}.
 *
 * CarbonDioxideConcentrationMeasurement.Cluster requires you to enable one or more optional features. You can do so
 * using {@link CarbonDioxideConcentrationMeasurementBehavior.with}.
 */
export const CarbonDioxideConcentrationMeasurementBehaviorConstructor = ClusterBehavior
    .for(ClusterType(CarbonDioxideConcentrationMeasurement.Base));

export interface CarbonDioxideConcentrationMeasurementBehaviorConstructor extends Identity<typeof CarbonDioxideConcentrationMeasurementBehaviorConstructor> {}
export const CarbonDioxideConcentrationMeasurementBehavior: CarbonDioxideConcentrationMeasurementBehaviorConstructor = CarbonDioxideConcentrationMeasurementBehaviorConstructor;
export interface CarbonDioxideConcentrationMeasurementBehavior extends InstanceType<CarbonDioxideConcentrationMeasurementBehaviorConstructor> {}
export namespace CarbonDioxideConcentrationMeasurementBehavior {
    export interface State extends InstanceType<typeof CarbonDioxideConcentrationMeasurementBehavior.State> {}
}
