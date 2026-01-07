/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OperationalState } from "#clusters/operational-state";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { OperationalStateInterface } from "./OperationalStateInterface.js";
import { Identity } from "#general";

/**
 * OperationalStateBehavior is the base class for objects that support interaction with
 * {@link OperationalState.Cluster}.
 */
export const OperationalStateBehaviorConstructor = ClusterBehavior
    .withInterface<OperationalStateInterface>()
    .for(OperationalState.Cluster);

export interface OperationalStateBehaviorConstructor extends Identity<typeof OperationalStateBehaviorConstructor> {}
export const OperationalStateBehavior: OperationalStateBehaviorConstructor = OperationalStateBehaviorConstructor;
export interface OperationalStateBehavior extends InstanceType<OperationalStateBehaviorConstructor> {}
export namespace OperationalStateBehavior {
    export interface State extends InstanceType<typeof OperationalStateBehavior.State> {}
}
