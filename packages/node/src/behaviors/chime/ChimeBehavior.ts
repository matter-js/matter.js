/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Chime } from "@matter/types/clusters/chime";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * ChimeBehavior is the base class for objects that support interaction with {@link Chime.Cluster}.
 */
export const ChimeBehaviorConstructor = ClusterBehavior.for(Chime);

export interface ChimeBehaviorConstructor extends Identity<typeof ChimeBehaviorConstructor> {}
export const ChimeBehavior: ChimeBehaviorConstructor = ChimeBehaviorConstructor;
export interface ChimeBehavior extends InstanceType<ChimeBehaviorConstructor> {}
export namespace ChimeBehavior { export interface State extends InstanceType<typeof ChimeBehavior.State> {} }
