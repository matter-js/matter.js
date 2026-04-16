/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { NetworkCommissioning } from "@matter/types/clusters/network-commissioning";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const NetworkCommissioningClientConstructor = ClientBehavior(NetworkCommissioning);
export interface NetworkCommissioningClient extends InstanceType<typeof NetworkCommissioningClientConstructor> {}
export interface NetworkCommissioningClientConstructor extends Identity<typeof NetworkCommissioningClientConstructor> {}
export const NetworkCommissioningClient: NetworkCommissioningClientConstructor = NetworkCommissioningClientConstructor;
