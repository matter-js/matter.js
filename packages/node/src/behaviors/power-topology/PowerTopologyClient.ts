/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PowerTopology } from "@matter/types/clusters/power-topology";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const PowerTopologyClientConstructor = ClientBehavior(PowerTopology);
export interface PowerTopologyClient extends InstanceType<typeof PowerTopologyClientConstructor> {}
export interface PowerTopologyClientConstructor extends Identity<typeof PowerTopologyClientConstructor> {}
export const PowerTopologyClient: PowerTopologyClientConstructor = PowerTopologyClientConstructor;
