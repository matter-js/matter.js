/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AdministratorCommissioning } from "#clusters/administrator-commissioning";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { AdministratorCommissioningInterface } from "./AdministratorCommissioningInterface.js";
import { Identity } from "#general";

/**
 * AdministratorCommissioningBehavior is the base class for objects that support interaction with
 * {@link AdministratorCommissioning.Cluster}.
 *
 * This class does not have optional features of AdministratorCommissioning.Cluster enabled. You can enable additional
 * features using AdministratorCommissioningBehavior.with.
 */
export const AdministratorCommissioningBehaviorConstructor = ClusterBehavior
    .withInterface<AdministratorCommissioningInterface>()
    .for(AdministratorCommissioning.Cluster);

export interface AdministratorCommissioningBehaviorConstructor extends Identity<typeof AdministratorCommissioningBehaviorConstructor> {}
export const AdministratorCommissioningBehavior: AdministratorCommissioningBehaviorConstructor = AdministratorCommissioningBehaviorConstructor;
export interface AdministratorCommissioningBehavior extends InstanceType<AdministratorCommissioningBehaviorConstructor> {}
export namespace AdministratorCommissioningBehavior {
    export interface State extends InstanceType<typeof AdministratorCommissioningBehavior.State> {}
}
