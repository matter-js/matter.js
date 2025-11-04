/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WaterTankLevelMonitoring } from "#clusters/water-tank-level-monitoring";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const WaterTankLevelMonitoringClientConstructor = ClientBehavior(WaterTankLevelMonitoring.Complete);
export interface WaterTankLevelMonitoringClient extends InstanceType<typeof WaterTankLevelMonitoringClientConstructor> {}
export interface WaterTankLevelMonitoringClientConstructor extends Identity<typeof WaterTankLevelMonitoringClientConstructor> {}
export const WaterTankLevelMonitoringClient: WaterTankLevelMonitoringClientConstructor = WaterTankLevelMonitoringClientConstructor;
