/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LowPower } from "#clusters/low-power";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const LowPowerClientConstructor = ClientBehavior(LowPower.Complete);
export interface LowPowerClient extends InstanceType<typeof LowPowerClientConstructor> {}
export interface LowPowerClientConstructor extends Identity<typeof LowPowerClientConstructor> {}
export const LowPowerClient: LowPowerClientConstructor = LowPowerClientConstructor;
