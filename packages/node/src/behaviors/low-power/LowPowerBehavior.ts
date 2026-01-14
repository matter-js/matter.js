/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LowPower } from "#clusters/low-power";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { LowPowerInterface } from "./LowPowerInterface.js";
import { Identity } from "#general";

/**
 * LowPowerBehavior is the base class for objects that support interaction with {@link LowPower.Cluster}.
 */
export const LowPowerBehaviorConstructor = ClusterBehavior
    .withInterface<LowPowerInterface>()
    .for(LowPower.Cluster);

export interface LowPowerBehaviorConstructor extends Identity<typeof LowPowerBehaviorConstructor> {}
export const LowPowerBehavior: LowPowerBehaviorConstructor = LowPowerBehaviorConstructor;
export interface LowPowerBehavior extends InstanceType<LowPowerBehaviorConstructor> {}
export namespace LowPowerBehavior { export interface State extends InstanceType<typeof LowPowerBehavior.State> {} }
