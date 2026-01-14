/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DeviceEnergyManagement } from "#clusters/device-energy-management";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { DeviceEnergyManagementInterface } from "./DeviceEnergyManagementInterface.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * DeviceEnergyManagementBehavior is the base class for objects that support interaction with
 * {@link DeviceEnergyManagement.Cluster}.
 *
 * DeviceEnergyManagement.Cluster requires you to enable one or more optional features. You can do so using
 * {@link DeviceEnergyManagementBehavior.with}.
 */
export const DeviceEnergyManagementBehaviorConstructor = ClusterBehavior
    .withInterface<DeviceEnergyManagementInterface>()
    .for(ClusterType(DeviceEnergyManagement.Base));

export interface DeviceEnergyManagementBehaviorConstructor extends Identity<typeof DeviceEnergyManagementBehaviorConstructor> {}
export const DeviceEnergyManagementBehavior: DeviceEnergyManagementBehaviorConstructor = DeviceEnergyManagementBehaviorConstructor;
export interface DeviceEnergyManagementBehavior extends InstanceType<DeviceEnergyManagementBehaviorConstructor> {}
export namespace DeviceEnergyManagementBehavior {
    export interface State extends InstanceType<typeof DeviceEnergyManagementBehavior.State> {}
}
