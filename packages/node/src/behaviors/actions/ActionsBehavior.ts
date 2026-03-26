/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Actions } from "@matter/types/clusters/actions";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * ActionsBehavior is the base class for objects that support interaction with {@link Actions.Cluster}.
 */
export const ActionsBehaviorConstructor = ClusterBehavior.for(Actions);

export interface ActionsBehaviorConstructor extends Identity<typeof ActionsBehaviorConstructor> {}
export const ActionsBehavior: ActionsBehaviorConstructor = ActionsBehaviorConstructor;
export interface ActionsBehavior extends InstanceType<ActionsBehaviorConstructor> {}
export namespace ActionsBehavior { export interface State extends InstanceType<typeof ActionsBehavior.State> {} }
