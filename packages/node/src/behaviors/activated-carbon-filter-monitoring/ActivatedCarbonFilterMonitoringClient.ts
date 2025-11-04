/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ActivatedCarbonFilterMonitoring } from "#clusters/activated-carbon-filter-monitoring";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ActivatedCarbonFilterMonitoringClientConstructor = ClientBehavior(ActivatedCarbonFilterMonitoring.Complete);
export interface ActivatedCarbonFilterMonitoringClient extends InstanceType<typeof ActivatedCarbonFilterMonitoringClientConstructor> {}
export interface ActivatedCarbonFilterMonitoringClientConstructor extends Identity<typeof ActivatedCarbonFilterMonitoringClientConstructor> {}
export const ActivatedCarbonFilterMonitoringClient: ActivatedCarbonFilterMonitoringClientConstructor = ActivatedCarbonFilterMonitoringClientConstructor;
