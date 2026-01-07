/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TemperatureMeasurement } from "#clusters/temperature-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * TemperatureMeasurementBehavior is the base class for objects that support interaction with
 * {@link TemperatureMeasurement.Cluster}.
 */
export const TemperatureMeasurementBehaviorConstructor = ClusterBehavior.for(TemperatureMeasurement.Cluster);

export interface TemperatureMeasurementBehaviorConstructor extends Identity<typeof TemperatureMeasurementBehaviorConstructor> {}
export const TemperatureMeasurementBehavior: TemperatureMeasurementBehaviorConstructor = TemperatureMeasurementBehaviorConstructor;
export interface TemperatureMeasurementBehavior extends InstanceType<TemperatureMeasurementBehaviorConstructor> {}
export namespace TemperatureMeasurementBehavior {
    export interface State extends InstanceType<typeof TemperatureMeasurementBehavior.State> {}
}
