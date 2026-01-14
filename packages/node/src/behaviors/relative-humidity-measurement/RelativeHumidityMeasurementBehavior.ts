/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RelativeHumidityMeasurement } from "#clusters/relative-humidity-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * RelativeHumidityMeasurementBehavior is the base class for objects that support interaction with
 * {@link RelativeHumidityMeasurement.Cluster}.
 */
export const RelativeHumidityMeasurementBehaviorConstructor = ClusterBehavior.for(RelativeHumidityMeasurement.Cluster);

export interface RelativeHumidityMeasurementBehaviorConstructor extends Identity<typeof RelativeHumidityMeasurementBehaviorConstructor> {}
export const RelativeHumidityMeasurementBehavior: RelativeHumidityMeasurementBehaviorConstructor = RelativeHumidityMeasurementBehaviorConstructor;
export interface RelativeHumidityMeasurementBehavior extends InstanceType<RelativeHumidityMeasurementBehaviorConstructor> {}
export namespace RelativeHumidityMeasurementBehavior {
    export interface State extends InstanceType<typeof RelativeHumidityMeasurementBehavior.State> {}
}
