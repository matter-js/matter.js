/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WakeOnLan } from "#clusters/wake-on-lan";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * WakeOnLanBehavior is the base class for objects that support interaction with {@link WakeOnLan.Cluster}.
 */
export const WakeOnLanBehaviorConstructor = ClusterBehavior.for(WakeOnLan.Cluster);

export interface WakeOnLanBehaviorConstructor extends Identity<typeof WakeOnLanBehaviorConstructor> {}
export const WakeOnLanBehavior: WakeOnLanBehaviorConstructor = WakeOnLanBehaviorConstructor;
export interface WakeOnLanBehavior extends InstanceType<WakeOnLanBehaviorConstructor> {}
export namespace WakeOnLanBehavior { export interface State extends InstanceType<typeof WakeOnLanBehavior.State> {} }
