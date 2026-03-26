/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RefrigeratorAlarm } from "@matter/types/clusters/refrigerator-alarm";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const RefrigeratorAlarmClientConstructor = ClientBehavior(RefrigeratorAlarm);
export interface RefrigeratorAlarmClient extends InstanceType<typeof RefrigeratorAlarmClientConstructor> {}
export interface RefrigeratorAlarmClientConstructor extends Identity<typeof RefrigeratorAlarmClientConstructor> {}
export const RefrigeratorAlarmClient: RefrigeratorAlarmClientConstructor = RefrigeratorAlarmClientConstructor;
