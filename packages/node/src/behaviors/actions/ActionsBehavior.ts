/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Actions } from "#clusters/actions";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ActionsInterface } from "./ActionsInterface.js";
import { Identity } from "#general";

/**
 * ActionsBehavior is the base class for objects that support interaction with {@link Actions.Cluster}.
 */
export const ActionsBehaviorConstructor = ClusterBehavior
    .withInterface<ActionsInterface>()
    .for(Actions.Cluster);

export interface ActionsBehaviorConstructor extends Identity<typeof ActionsBehaviorConstructor> {}
export const ActionsBehavior: ActionsBehaviorConstructor = ActionsBehaviorConstructor;
export interface ActionsBehavior extends InstanceType<ActionsBehaviorConstructor> {}
export namespace ActionsBehavior { export interface State extends InstanceType<typeof ActionsBehavior.State> {} }
