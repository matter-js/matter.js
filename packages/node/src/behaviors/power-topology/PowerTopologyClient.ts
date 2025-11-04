/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PowerTopology } from "#clusters/power-topology";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const PowerTopologyClientConstructor = ClientBehavior(PowerTopology.Complete);
export interface PowerTopologyClient extends InstanceType<typeof PowerTopologyClientConstructor> {}
export interface PowerTopologyClientConstructor extends Identity<typeof PowerTopologyClientConstructor> {}
export const PowerTopologyClient: PowerTopologyClientConstructor = PowerTopologyClientConstructor;
