/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IlluminanceMeasurement } from "#clusters/illuminance-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * IlluminanceMeasurementBehavior is the base class for objects that support interaction with
 * {@link IlluminanceMeasurement.Cluster}.
 */
export const IlluminanceMeasurementBehaviorConstructor = ClusterBehavior.for(IlluminanceMeasurement.Cluster);

export interface IlluminanceMeasurementBehaviorConstructor extends Identity<typeof IlluminanceMeasurementBehaviorConstructor> {}
export const IlluminanceMeasurementBehavior: IlluminanceMeasurementBehaviorConstructor = IlluminanceMeasurementBehaviorConstructor;
export interface IlluminanceMeasurementBehavior extends InstanceType<IlluminanceMeasurementBehaviorConstructor> {}
export namespace IlluminanceMeasurementBehavior {
    export interface State extends InstanceType<typeof IlluminanceMeasurementBehavior.State> {}
}
