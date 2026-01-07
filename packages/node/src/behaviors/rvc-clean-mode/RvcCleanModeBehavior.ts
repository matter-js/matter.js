/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RvcCleanMode } from "#clusters/rvc-clean-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { RvcCleanModeInterface } from "./RvcCleanModeInterface.js";
import { Identity } from "#general";

/**
 * RvcCleanModeBehavior is the base class for objects that support interaction with {@link RvcCleanMode.Cluster}.
 */
export const RvcCleanModeBehaviorConstructor = ClusterBehavior
    .withInterface<RvcCleanModeInterface>()
    .for(RvcCleanMode.Cluster);

export interface RvcCleanModeBehaviorConstructor extends Identity<typeof RvcCleanModeBehaviorConstructor> {}
export const RvcCleanModeBehavior: RvcCleanModeBehaviorConstructor = RvcCleanModeBehaviorConstructor;
export interface RvcCleanModeBehavior extends InstanceType<RvcCleanModeBehaviorConstructor> {}
export namespace RvcCleanModeBehavior { export interface State extends InstanceType<typeof RvcCleanModeBehavior.State> {} }
