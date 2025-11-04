/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ElectricalPowerMeasurement } from "#clusters/electrical-power-measurement";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ElectricalPowerMeasurementClientConstructor = ClientBehavior(ElectricalPowerMeasurement.Complete);
export interface ElectricalPowerMeasurementClient extends InstanceType<typeof ElectricalPowerMeasurementClientConstructor> {}
export interface ElectricalPowerMeasurementClientConstructor extends Identity<typeof ElectricalPowerMeasurementClientConstructor> {}
export const ElectricalPowerMeasurementClient: ElectricalPowerMeasurementClientConstructor = ElectricalPowerMeasurementClientConstructor;
