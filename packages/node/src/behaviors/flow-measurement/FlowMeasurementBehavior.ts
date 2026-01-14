/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FlowMeasurement } from "#clusters/flow-measurement";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * FlowMeasurementBehavior is the base class for objects that support interaction with {@link FlowMeasurement.Cluster}.
 */
export const FlowMeasurementBehaviorConstructor = ClusterBehavior.for(FlowMeasurement.Cluster);

export interface FlowMeasurementBehaviorConstructor extends Identity<typeof FlowMeasurementBehaviorConstructor> {}
export const FlowMeasurementBehavior: FlowMeasurementBehaviorConstructor = FlowMeasurementBehaviorConstructor;
export interface FlowMeasurementBehavior extends InstanceType<FlowMeasurementBehaviorConstructor> {}
export namespace FlowMeasurementBehavior {
    export interface State extends InstanceType<typeof FlowMeasurementBehavior.State> {}
}
