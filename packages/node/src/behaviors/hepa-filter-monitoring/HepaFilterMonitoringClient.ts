/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { HepaFilterMonitoring } from "@matter/types/clusters/hepa-filter-monitoring";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const HepaFilterMonitoringClientConstructor = ClientBehavior(HepaFilterMonitoring);
export interface HepaFilterMonitoringClient extends InstanceType<typeof HepaFilterMonitoringClientConstructor> {}
export interface HepaFilterMonitoringClientConstructor extends Identity<typeof HepaFilterMonitoringClientConstructor> {}
export const HepaFilterMonitoringClient: HepaFilterMonitoringClientConstructor = HepaFilterMonitoringClientConstructor;
