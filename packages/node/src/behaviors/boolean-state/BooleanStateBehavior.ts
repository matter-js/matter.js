/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BooleanState } from "#clusters/boolean-state";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * BooleanStateBehavior is the base class for objects that support interaction with {@link BooleanState.Cluster}.
 */
export const BooleanStateBehaviorConstructor = ClusterBehavior.for(BooleanState.Cluster);

export interface BooleanStateBehaviorConstructor extends Identity<typeof BooleanStateBehaviorConstructor> {}
export const BooleanStateBehavior: BooleanStateBehaviorConstructor = BooleanStateBehaviorConstructor;
export interface BooleanStateBehavior extends InstanceType<BooleanStateBehaviorConstructor> {}
export namespace BooleanStateBehavior { export interface State extends InstanceType<typeof BooleanStateBehavior.State> {} }
