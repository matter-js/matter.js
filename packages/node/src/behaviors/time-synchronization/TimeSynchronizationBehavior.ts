/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TimeSynchronization } from "#clusters/time-synchronization";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { TimeSynchronizationInterface } from "./TimeSynchronizationInterface.js";
import { Identity } from "#general";

/**
 * TimeSynchronizationBehavior is the base class for objects that support interaction with
 * {@link TimeSynchronization.Cluster}.
 *
 * This class does not have optional features of TimeSynchronization.Cluster enabled. You can enable additional features
 * using TimeSynchronizationBehavior.with.
 */
export const TimeSynchronizationBehaviorConstructor = ClusterBehavior
    .withInterface<TimeSynchronizationInterface>()
    .for(TimeSynchronization.Cluster);

export interface TimeSynchronizationBehaviorConstructor extends Identity<typeof TimeSynchronizationBehaviorConstructor> {}
export const TimeSynchronizationBehavior: TimeSynchronizationBehaviorConstructor = TimeSynchronizationBehaviorConstructor;
export interface TimeSynchronizationBehavior extends InstanceType<TimeSynchronizationBehaviorConstructor> {}
export namespace TimeSynchronizationBehavior {
    export interface State extends InstanceType<typeof TimeSynchronizationBehavior.State> {}
}
