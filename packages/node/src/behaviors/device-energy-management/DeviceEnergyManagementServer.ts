/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE WILL BE REGENERATED IF YOU DO NOT REMOVE THIS MESSAGE ***/

import { DeviceEnergyManagementBehavior } from "./DeviceEnergyManagementBehavior.js";

/**
 * This is the default server implementation of {@link DeviceEnergyManagementBehavior}.
 *
 * The Matter specification requires the DeviceEnergyManagement cluster to support features we do not enable by default.
 * You should use {@link DeviceEnergyManagementServer.with} to specialize the class for the features your implementation
 * supports.
 */
export class DeviceEnergyManagementServer extends DeviceEnergyManagementBehavior {}
