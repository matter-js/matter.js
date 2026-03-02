/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DeviceEnergyManagementMode } from "@matter/types/clusters/device-energy-management-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const DeviceEnergyManagementModeClientConstructor = ClientBehavior(DeviceEnergyManagementMode.Complete);
export interface DeviceEnergyManagementModeClient extends InstanceType<typeof DeviceEnergyManagementModeClientConstructor> {}
export interface DeviceEnergyManagementModeClientConstructor extends Identity<typeof DeviceEnergyManagementModeClientConstructor> {}
export const DeviceEnergyManagementModeClient: DeviceEnergyManagementModeClientConstructor = DeviceEnergyManagementModeClientConstructor;
