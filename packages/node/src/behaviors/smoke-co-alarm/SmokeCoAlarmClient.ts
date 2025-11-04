/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SmokeCoAlarm } from "#clusters/smoke-co-alarm";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const SmokeCoAlarmClientConstructor = ClientBehavior(SmokeCoAlarm.Complete);
export interface SmokeCoAlarmClient extends InstanceType<typeof SmokeCoAlarmClientConstructor> {}
export interface SmokeCoAlarmClientConstructor extends Identity<typeof SmokeCoAlarmClientConstructor> {}
export const SmokeCoAlarmClient: SmokeCoAlarmClientConstructor = SmokeCoAlarmClientConstructor;
