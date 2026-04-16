/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LowPower } from "@matter/types/clusters/low-power";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * LowPowerBehavior is the base class for objects that support interaction with {@link LowPower.Cluster}.
 */
export const LowPowerBehaviorConstructor = ClusterBehavior.for(LowPower);

export interface LowPowerBehaviorConstructor extends Identity<typeof LowPowerBehaviorConstructor> {}
export const LowPowerBehavior: LowPowerBehaviorConstructor = LowPowerBehaviorConstructor;
export interface LowPowerBehavior extends InstanceType<LowPowerBehaviorConstructor> {}
export namespace LowPowerBehavior { export interface State extends InstanceType<typeof LowPowerBehavior.State> {} }
