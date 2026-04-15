/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LowPower } from "@matter/types/clusters/low-power";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const LowPowerClientConstructor = ClientBehavior(LowPower);
export interface LowPowerClient extends InstanceType<typeof LowPowerClientConstructor> {}
export interface LowPowerClientConstructor extends Identity<typeof LowPowerClientConstructor> {}
export const LowPowerClient: LowPowerClientConstructor = LowPowerClientConstructor;
