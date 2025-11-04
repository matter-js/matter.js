/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Pm10ConcentrationMeasurement } from "#clusters/pm10-concentration-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const Pm10ConcentrationMeasurementClientConstructor = ClientBehavior(Pm10ConcentrationMeasurement.Complete);
export interface Pm10ConcentrationMeasurementClient extends InstanceType<typeof Pm10ConcentrationMeasurementClientConstructor> {}
export interface Pm10ConcentrationMeasurementClientConstructor extends Identity<typeof Pm10ConcentrationMeasurementClientConstructor> {}
export const Pm10ConcentrationMeasurementClient: Pm10ConcentrationMeasurementClientConstructor = Pm10ConcentrationMeasurementClientConstructor;
