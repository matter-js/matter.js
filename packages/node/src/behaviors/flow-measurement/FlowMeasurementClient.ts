/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FlowMeasurement } from "#clusters/flow-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const FlowMeasurementClientConstructor = ClientBehavior(FlowMeasurement.Complete);
export interface FlowMeasurementClient extends InstanceType<typeof FlowMeasurementClientConstructor> {}
export interface FlowMeasurementClientConstructor extends Identity<typeof FlowMeasurementClientConstructor> {}
export const FlowMeasurementClient: FlowMeasurementClientConstructor = FlowMeasurementClientConstructor;
