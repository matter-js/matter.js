/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PowerSource } from "@matter/types/clusters/power-source";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const PowerSourceClientConstructor = ClientBehavior(PowerSource);
export interface PowerSourceClient extends InstanceType<typeof PowerSourceClientConstructor> {}
export interface PowerSourceClientConstructor extends Identity<typeof PowerSourceClientConstructor> {}
export const PowerSourceClient: PowerSourceClientConstructor = PowerSourceClientConstructor;
