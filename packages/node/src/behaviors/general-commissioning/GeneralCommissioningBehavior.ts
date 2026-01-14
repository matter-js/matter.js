/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { GeneralCommissioning } from "#clusters/general-commissioning";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { GeneralCommissioningInterface } from "./GeneralCommissioningInterface.js";
import { Identity } from "#general";

/**
 * GeneralCommissioningBehavior is the base class for objects that support interaction with
 * {@link GeneralCommissioning.Cluster}.
 *
 * This class does not have optional features of GeneralCommissioning.Cluster enabled. You can enable additional
 * features using GeneralCommissioningBehavior.with.
 */
export const GeneralCommissioningBehaviorConstructor = ClusterBehavior
    .withInterface<GeneralCommissioningInterface>()
    .for(GeneralCommissioning.Cluster);

export interface GeneralCommissioningBehaviorConstructor extends Identity<typeof GeneralCommissioningBehaviorConstructor> {}
export const GeneralCommissioningBehavior: GeneralCommissioningBehaviorConstructor = GeneralCommissioningBehaviorConstructor;
export interface GeneralCommissioningBehavior extends InstanceType<GeneralCommissioningBehaviorConstructor> {}
export namespace GeneralCommissioningBehavior {
    export interface State extends InstanceType<typeof GeneralCommissioningBehavior.State> {}
}
