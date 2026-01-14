/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RvcOperationalState } from "#clusters/rvc-operational-state";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { RvcOperationalStateInterface } from "./RvcOperationalStateInterface.js";
import { Identity } from "#general";

/**
 * RvcOperationalStateBehavior is the base class for objects that support interaction with
 * {@link RvcOperationalState.Cluster}.
 */
export const RvcOperationalStateBehaviorConstructor = ClusterBehavior
    .withInterface<RvcOperationalStateInterface>()
    .for(RvcOperationalState.Cluster);

export interface RvcOperationalStateBehaviorConstructor extends Identity<typeof RvcOperationalStateBehaviorConstructor> {}
export const RvcOperationalStateBehavior: RvcOperationalStateBehaviorConstructor = RvcOperationalStateBehaviorConstructor;
export interface RvcOperationalStateBehavior extends InstanceType<RvcOperationalStateBehaviorConstructor> {}
export namespace RvcOperationalStateBehavior {
    export interface State extends InstanceType<typeof RvcOperationalStateBehavior.State> {}
}
