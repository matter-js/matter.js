/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DoorLock } from "#clusters/door-lock";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { DoorLockInterface } from "./DoorLockInterface.js";
import { Identity } from "#general";

/**
 * DoorLockBehavior is the base class for objects that support interaction with {@link DoorLock.Cluster}.
 *
 * This class does not have optional features of DoorLock.Cluster enabled. You can enable additional features using
 * DoorLockBehavior.with.
 */
export const DoorLockBehaviorConstructor = ClusterBehavior
    .withInterface<DoorLockInterface>()
    .for(DoorLock.Cluster);

export interface DoorLockBehaviorConstructor extends Identity<typeof DoorLockBehaviorConstructor> {}
export const DoorLockBehavior: DoorLockBehaviorConstructor = DoorLockBehaviorConstructor;
export interface DoorLockBehavior extends InstanceType<DoorLockBehaviorConstructor> {}
export namespace DoorLockBehavior { export interface State extends InstanceType<typeof DoorLockBehavior.State> {} }
