/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SoilMeasurement } from "@matter/types/clusters/soil-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * SoilMeasurementBehavior is the base class for objects that support interaction with {@link SoilMeasurement.Cluster}.
 */
export const SoilMeasurementBehaviorConstructor = ClusterBehavior.for(SoilMeasurement.Cluster);

export interface SoilMeasurementBehaviorConstructor extends Identity<typeof SoilMeasurementBehaviorConstructor> {}
export const SoilMeasurementBehavior: SoilMeasurementBehaviorConstructor = SoilMeasurementBehaviorConstructor;
export interface SoilMeasurementBehavior extends InstanceType<SoilMeasurementBehaviorConstructor> {}
export namespace SoilMeasurementBehavior {
    export interface State extends InstanceType<typeof SoilMeasurementBehavior.State> {}
}
