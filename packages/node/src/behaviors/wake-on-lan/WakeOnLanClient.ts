/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WakeOnLan } from "#clusters/wake-on-lan";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const WakeOnLanClientConstructor = ClientBehavior(WakeOnLan.Complete);
export interface WakeOnLanClient extends InstanceType<typeof WakeOnLanClientConstructor> {}
export interface WakeOnLanClientConstructor extends Identity<typeof WakeOnLanClientConstructor> {}
export const WakeOnLanClient: WakeOnLanClientConstructor = WakeOnLanClientConstructor;
