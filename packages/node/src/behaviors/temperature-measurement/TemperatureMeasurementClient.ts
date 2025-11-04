/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TemperatureMeasurement } from "#clusters/temperature-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const TemperatureMeasurementClientConstructor = ClientBehavior(TemperatureMeasurement.Complete);
export interface TemperatureMeasurementClient extends InstanceType<typeof TemperatureMeasurementClientConstructor> {}
export interface TemperatureMeasurementClientConstructor extends Identity<typeof TemperatureMeasurementClientConstructor> {}
export const TemperatureMeasurementClient: TemperatureMeasurementClientConstructor = TemperatureMeasurementClientConstructor;
