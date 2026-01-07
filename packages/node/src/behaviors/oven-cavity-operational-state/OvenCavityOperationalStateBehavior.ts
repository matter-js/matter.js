/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OvenCavityOperationalState } from "#clusters/oven-cavity-operational-state";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { OvenCavityOperationalStateInterface } from "./OvenCavityOperationalStateInterface.js";
import { Identity } from "#general";

/**
 * OvenCavityOperationalStateBehavior is the base class for objects that support interaction with
 * {@link OvenCavityOperationalState.Cluster}.
 */
export const OvenCavityOperationalStateBehaviorConstructor = ClusterBehavior
    .withInterface<OvenCavityOperationalStateInterface>()
    .for(OvenCavityOperationalState.Cluster);

export interface OvenCavityOperationalStateBehaviorConstructor extends Identity<typeof OvenCavityOperationalStateBehaviorConstructor> {}
export const OvenCavityOperationalStateBehavior: OvenCavityOperationalStateBehaviorConstructor = OvenCavityOperationalStateBehaviorConstructor;
export interface OvenCavityOperationalStateBehavior extends InstanceType<OvenCavityOperationalStateBehaviorConstructor> {}
export namespace OvenCavityOperationalStateBehavior {
    export interface State extends InstanceType<typeof OvenCavityOperationalStateBehavior.State> {}
}
