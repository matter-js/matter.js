/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ScenesManagement } from "#clusters/scenes-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ScenesManagementClientConstructor = ClientBehavior(ScenesManagement.Complete);
export interface ScenesManagementClient extends InstanceType<typeof ScenesManagementClientConstructor> {}
export interface ScenesManagementClientConstructor extends Identity<typeof ScenesManagementClientConstructor> {}
export const ScenesManagementClient: ScenesManagementClientConstructor = ScenesManagementClientConstructor;
