/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DeviceEnergyManagement } from "@matter/types/clusters/device-energy-management";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const DeviceEnergyManagementClientConstructor = ClientBehavior(DeviceEnergyManagement);
export interface DeviceEnergyManagementClient extends InstanceType<typeof DeviceEnergyManagementClientConstructor> {}
export interface DeviceEnergyManagementClientConstructor extends Identity<typeof DeviceEnergyManagementClientConstructor> {}
export const DeviceEnergyManagementClient: DeviceEnergyManagementClientConstructor = DeviceEnergyManagementClientConstructor;
