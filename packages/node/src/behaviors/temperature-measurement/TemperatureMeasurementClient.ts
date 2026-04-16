/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TemperatureMeasurement } from "@matter/types/clusters/temperature-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const TemperatureMeasurementClientConstructor = ClientBehavior(TemperatureMeasurement);
export interface TemperatureMeasurementClient extends InstanceType<typeof TemperatureMeasurementClientConstructor> {}
export interface TemperatureMeasurementClientConstructor extends Identity<typeof TemperatureMeasurementClientConstructor> {}
export const TemperatureMeasurementClient: TemperatureMeasurementClientConstructor = TemperatureMeasurementClientConstructor;
