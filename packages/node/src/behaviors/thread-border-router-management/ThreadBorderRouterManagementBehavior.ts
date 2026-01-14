/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThreadBorderRouterManagement } from "#clusters/thread-border-router-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ThreadBorderRouterManagementInterface } from "./ThreadBorderRouterManagementInterface.js";
import { Identity } from "#general";

/**
 * ThreadBorderRouterManagementBehavior is the base class for objects that support interaction with
 * {@link ThreadBorderRouterManagement.Cluster}.
 *
 * This class does not have optional features of ThreadBorderRouterManagement.Cluster enabled. You can enable additional
 * features using ThreadBorderRouterManagementBehavior.with.
 */
export const ThreadBorderRouterManagementBehaviorConstructor = ClusterBehavior
    .withInterface<ThreadBorderRouterManagementInterface>()
    .for(ThreadBorderRouterManagement.Cluster);

export interface ThreadBorderRouterManagementBehaviorConstructor extends Identity<typeof ThreadBorderRouterManagementBehaviorConstructor> {}
export const ThreadBorderRouterManagementBehavior: ThreadBorderRouterManagementBehaviorConstructor = ThreadBorderRouterManagementBehaviorConstructor;
export interface ThreadBorderRouterManagementBehavior extends InstanceType<ThreadBorderRouterManagementBehaviorConstructor> {}
export namespace ThreadBorderRouterManagementBehavior {
    export interface State extends InstanceType<typeof ThreadBorderRouterManagementBehavior.State> {}
}
