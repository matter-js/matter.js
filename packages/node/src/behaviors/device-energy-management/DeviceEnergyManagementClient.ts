/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DeviceEnergyManagement } from "#clusters/device-energy-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const DeviceEnergyManagementClientConstructor = ClientBehavior(DeviceEnergyManagement.Complete);
export interface DeviceEnergyManagementClient extends InstanceType<typeof DeviceEnergyManagementClientConstructor> {}
export interface DeviceEnergyManagementClientConstructor extends Identity<typeof DeviceEnergyManagementClientConstructor> {}
export const DeviceEnergyManagementClient: DeviceEnergyManagementClientConstructor = DeviceEnergyManagementClientConstructor;
