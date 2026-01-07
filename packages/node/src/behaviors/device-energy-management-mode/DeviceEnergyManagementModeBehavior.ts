/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DeviceEnergyManagementMode } from "#clusters/device-energy-management-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { DeviceEnergyManagementModeInterface } from "./DeviceEnergyManagementModeInterface.js";
import { Identity } from "#general";

/**
 * DeviceEnergyManagementModeBehavior is the base class for objects that support interaction with
 * {@link DeviceEnergyManagementMode.Cluster}.
 */
export const DeviceEnergyManagementModeBehaviorConstructor = ClusterBehavior
    .withInterface<DeviceEnergyManagementModeInterface>()
    .for(DeviceEnergyManagementMode.Cluster);

export interface DeviceEnergyManagementModeBehaviorConstructor extends Identity<typeof DeviceEnergyManagementModeBehaviorConstructor> {}
export const DeviceEnergyManagementModeBehavior: DeviceEnergyManagementModeBehaviorConstructor = DeviceEnergyManagementModeBehaviorConstructor;
export interface DeviceEnergyManagementModeBehavior extends InstanceType<DeviceEnergyManagementModeBehaviorConstructor> {}
export namespace DeviceEnergyManagementModeBehavior {
    export interface State extends InstanceType<typeof DeviceEnergyManagementModeBehavior.State> {}
}
