/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PowerSource } from "#clusters/power-source";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const PowerSourceClientConstructor = ClientBehavior(PowerSource.Complete);
export interface PowerSourceClient extends InstanceType<typeof PowerSourceClientConstructor> {}
export interface PowerSourceClientConstructor extends Identity<typeof PowerSourceClientConstructor> {}
export const PowerSourceClient: PowerSourceClientConstructor = PowerSourceClientConstructor;
