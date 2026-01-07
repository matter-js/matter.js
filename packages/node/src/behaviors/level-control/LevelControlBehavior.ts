/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LevelControl } from "#clusters/level-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { LevelControlInterface } from "./LevelControlInterface.js";
import { Identity } from "#general";

/**
 * LevelControlBehavior is the base class for objects that support interaction with {@link LevelControl.Cluster}.
 *
 * This class does not have optional features of LevelControl.Cluster enabled. You can enable additional features using
 * LevelControlBehavior.with.
 */
export const LevelControlBehaviorConstructor = ClusterBehavior
    .withInterface<LevelControlInterface>()
    .for(LevelControl.Cluster);

export interface LevelControlBehaviorConstructor extends Identity<typeof LevelControlBehaviorConstructor> {}
export const LevelControlBehavior: LevelControlBehaviorConstructor = LevelControlBehaviorConstructor;
export interface LevelControlBehavior extends InstanceType<LevelControlBehaviorConstructor> {}
export namespace LevelControlBehavior { export interface State extends InstanceType<typeof LevelControlBehavior.State> {} }
