/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { NetworkCommissioning } from "#clusters/network-commissioning";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { NetworkCommissioningInterface } from "./NetworkCommissioningInterface.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * NetworkCommissioningBehavior is the base class for objects that support interaction with
 * {@link NetworkCommissioning.Cluster}.
 *
 * NetworkCommissioning.Cluster requires you to enable one or more optional features. You can do so using
 * {@link NetworkCommissioningBehavior.with}.
 */
export const NetworkCommissioningBehaviorConstructor = ClusterBehavior
    .withInterface<NetworkCommissioningInterface>()
    .for(ClusterType(NetworkCommissioning.Base));

export interface NetworkCommissioningBehaviorConstructor extends Identity<typeof NetworkCommissioningBehaviorConstructor> {}
export const NetworkCommissioningBehavior: NetworkCommissioningBehaviorConstructor = NetworkCommissioningBehaviorConstructor;
export interface NetworkCommissioningBehavior extends InstanceType<NetworkCommissioningBehaviorConstructor> {}
export namespace NetworkCommissioningBehavior {
    export interface State extends InstanceType<typeof NetworkCommissioningBehavior.State> {}
}
