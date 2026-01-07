/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { FanControl } from "#clusters/fan-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { FanControlInterface } from "./FanControlInterface.js";
import { Identity } from "#general";

/**
 * FanControlBehavior is the base class for objects that support interaction with {@link FanControl.Cluster}.
 *
 * This class does not have optional features of FanControl.Cluster enabled. You can enable additional features using
 * FanControlBehavior.with.
 */
export const FanControlBehaviorConstructor = ClusterBehavior
    .withInterface<FanControlInterface>()
    .for(FanControl.Cluster);

export interface FanControlBehaviorConstructor extends Identity<typeof FanControlBehaviorConstructor> {}
export const FanControlBehavior: FanControlBehaviorConstructor = FanControlBehaviorConstructor;
export interface FanControlBehavior extends InstanceType<FanControlBehaviorConstructor> {}
export namespace FanControlBehavior { export interface State extends InstanceType<typeof FanControlBehavior.State> {} }
