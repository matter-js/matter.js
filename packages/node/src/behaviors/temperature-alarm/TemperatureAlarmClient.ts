/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TemperatureAlarm } from "@matter/types/clusters/temperature-alarm";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const TemperatureAlarmClientConstructor = ClientBehavior(TemperatureAlarm);
export interface TemperatureAlarmClient extends InstanceType<typeof TemperatureAlarmClientConstructor> {}
export interface TemperatureAlarmClientConstructor extends Identity<typeof TemperatureAlarmClientConstructor> {}
export const TemperatureAlarmClient: TemperatureAlarmClientConstructor = TemperatureAlarmClientConstructor;
