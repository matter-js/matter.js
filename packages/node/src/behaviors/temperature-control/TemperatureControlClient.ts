/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TemperatureControl } from "#clusters/temperature-control";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const TemperatureControlClientConstructor = ClientBehavior(TemperatureControl.Complete);
export interface TemperatureControlClient extends InstanceType<typeof TemperatureControlClientConstructor> {}
export interface TemperatureControlClientConstructor extends Identity<typeof TemperatureControlClientConstructor> {}
export const TemperatureControlClient: TemperatureControlClientConstructor = TemperatureControlClientConstructor;
