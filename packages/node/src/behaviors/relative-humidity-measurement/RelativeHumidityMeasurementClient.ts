/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RelativeHumidityMeasurement } from "@matter/types/clusters/relative-humidity-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const RelativeHumidityMeasurementClientConstructor = ClientBehavior(RelativeHumidityMeasurement);
export interface RelativeHumidityMeasurementClient extends InstanceType<typeof RelativeHumidityMeasurementClientConstructor> {}
export interface RelativeHumidityMeasurementClientConstructor extends Identity<typeof RelativeHumidityMeasurementClientConstructor> {}
export const RelativeHumidityMeasurementClient: RelativeHumidityMeasurementClientConstructor = RelativeHumidityMeasurementClientConstructor;
