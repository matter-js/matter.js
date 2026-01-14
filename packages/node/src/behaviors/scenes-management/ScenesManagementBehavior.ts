/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ScenesManagement } from "#clusters/scenes-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ScenesManagementInterface } from "./ScenesManagementInterface.js";
import { Identity } from "#general";

/**
 * ScenesManagementBehavior is the base class for objects that support interaction with
 * {@link ScenesManagement.Cluster}.
 */
export const ScenesManagementBehaviorConstructor = ClusterBehavior
    .withInterface<ScenesManagementInterface>()
    .for(ScenesManagement.Cluster);

export interface ScenesManagementBehaviorConstructor extends Identity<typeof ScenesManagementBehaviorConstructor> {}
export const ScenesManagementBehavior: ScenesManagementBehaviorConstructor = ScenesManagementBehaviorConstructor;
export interface ScenesManagementBehavior extends InstanceType<ScenesManagementBehaviorConstructor> {}
export namespace ScenesManagementBehavior {
    export interface State extends InstanceType<typeof ScenesManagementBehavior.State> {}
}
