/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RvcRunMode } from "@matter/types/clusters/rvc-run-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * RvcRunModeBehavior is the base class for objects that support interaction with {@link RvcRunMode.Cluster}.
 */
export const RvcRunModeBehaviorConstructor = ClusterBehavior.for(RvcRunMode);

export interface RvcRunModeBehaviorConstructor extends Identity<typeof RvcRunModeBehaviorConstructor> {}
export const RvcRunModeBehavior: RvcRunModeBehaviorConstructor = RvcRunModeBehaviorConstructor;
export interface RvcRunModeBehavior extends InstanceType<RvcRunModeBehaviorConstructor> {}
export namespace RvcRunModeBehavior { export interface State extends InstanceType<typeof RvcRunModeBehavior.State> {} }
