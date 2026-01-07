/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { WaterHeaterManagement } from "#clusters/water-heater-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { WaterHeaterManagementInterface } from "./WaterHeaterManagementInterface.js";
import { Identity } from "#general";

/**
 * WaterHeaterManagementBehavior is the base class for objects that support interaction with
 * {@link WaterHeaterManagement.Cluster}.
 *
 * This class does not have optional features of WaterHeaterManagement.Cluster enabled. You can enable additional
 * features using WaterHeaterManagementBehavior.with.
 */
export const WaterHeaterManagementBehaviorConstructor = ClusterBehavior
    .withInterface<WaterHeaterManagementInterface>()
    .for(WaterHeaterManagement.Cluster);

export interface WaterHeaterManagementBehaviorConstructor extends Identity<typeof WaterHeaterManagementBehaviorConstructor> {}
export const WaterHeaterManagementBehavior: WaterHeaterManagementBehaviorConstructor = WaterHeaterManagementBehaviorConstructor;
export interface WaterHeaterManagementBehavior extends InstanceType<WaterHeaterManagementBehaviorConstructor> {}
export namespace WaterHeaterManagementBehavior {
    export interface State extends InstanceType<typeof WaterHeaterManagementBehavior.State> {}
}
