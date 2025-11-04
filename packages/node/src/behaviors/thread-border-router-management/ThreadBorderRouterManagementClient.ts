/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThreadBorderRouterManagement } from "#clusters/thread-border-router-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ThreadBorderRouterManagementClientConstructor = ClientBehavior(ThreadBorderRouterManagement.Complete);
export interface ThreadBorderRouterManagementClient extends InstanceType<typeof ThreadBorderRouterManagementClientConstructor> {}
export interface ThreadBorderRouterManagementClientConstructor extends Identity<typeof ThreadBorderRouterManagementClientConstructor> {}
export const ThreadBorderRouterManagementClient: ThreadBorderRouterManagementClientConstructor = ThreadBorderRouterManagementClientConstructor;
