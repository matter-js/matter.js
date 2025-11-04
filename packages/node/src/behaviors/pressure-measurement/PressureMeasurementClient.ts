/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PressureMeasurement } from "#clusters/pressure-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const PressureMeasurementClientConstructor = ClientBehavior(PressureMeasurement.Complete);
export interface PressureMeasurementClient extends InstanceType<typeof PressureMeasurementClientConstructor> {}
export interface PressureMeasurementClientConstructor extends Identity<typeof PressureMeasurementClientConstructor> {}
export const PressureMeasurementClient: PressureMeasurementClientConstructor = PressureMeasurementClientConstructor;
