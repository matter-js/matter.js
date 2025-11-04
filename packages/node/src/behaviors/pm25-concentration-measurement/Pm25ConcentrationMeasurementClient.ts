/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Pm25ConcentrationMeasurement } from "#clusters/pm25-concentration-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const Pm25ConcentrationMeasurementClientConstructor = ClientBehavior(Pm25ConcentrationMeasurement.Complete);
export interface Pm25ConcentrationMeasurementClient extends InstanceType<typeof Pm25ConcentrationMeasurementClientConstructor> {}
export interface Pm25ConcentrationMeasurementClientConstructor extends Identity<typeof Pm25ConcentrationMeasurementClientConstructor> {}
export const Pm25ConcentrationMeasurementClient: Pm25ConcentrationMeasurementClientConstructor = Pm25ConcentrationMeasurementClientConstructor;
