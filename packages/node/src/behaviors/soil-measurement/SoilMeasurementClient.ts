/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SoilMeasurement } from "@matter/types/clusters/soil-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const SoilMeasurementClientConstructor = ClientBehavior(SoilMeasurement.Complete);
export interface SoilMeasurementClient extends InstanceType<typeof SoilMeasurementClientConstructor> {}
export interface SoilMeasurementClientConstructor extends Identity<typeof SoilMeasurementClientConstructor> {}
export const SoilMeasurementClient: SoilMeasurementClientConstructor = SoilMeasurementClientConstructor;
