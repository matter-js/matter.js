/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IcdManagement } from "#clusters/icd-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { IcdManagementInterface } from "./IcdManagementInterface.js";
import { Identity } from "#general";

/**
 * IcdManagementBehavior is the base class for objects that support interaction with {@link IcdManagement.Cluster}.
 *
 * This class does not have optional features of IcdManagement.Cluster enabled. You can enable additional features using
 * IcdManagementBehavior.with.
 */
export const IcdManagementBehaviorConstructor = ClusterBehavior
    .withInterface<IcdManagementInterface>()
    .for(IcdManagement.Cluster);

export interface IcdManagementBehaviorConstructor extends Identity<typeof IcdManagementBehaviorConstructor> {}
export const IcdManagementBehavior: IcdManagementBehaviorConstructor = IcdManagementBehaviorConstructor;
export interface IcdManagementBehavior extends InstanceType<IcdManagementBehaviorConstructor> {}
export namespace IcdManagementBehavior {
    export interface State extends InstanceType<typeof IcdManagementBehavior.State> {}
}
