/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IlluminanceMeasurement } from "#clusters/illuminance-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const IlluminanceMeasurementClientConstructor = ClientBehavior(IlluminanceMeasurement.Complete);
export interface IlluminanceMeasurementClient extends InstanceType<typeof IlluminanceMeasurementClientConstructor> {}
export interface IlluminanceMeasurementClientConstructor extends Identity<typeof IlluminanceMeasurementClientConstructor> {}
export const IlluminanceMeasurementClient: IlluminanceMeasurementClientConstructor = IlluminanceMeasurementClientConstructor;
