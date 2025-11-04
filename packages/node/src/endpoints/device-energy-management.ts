/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    DeviceEnergyManagementServer as BaseDeviceEnergyManagementServer
} from "../behaviors/device-energy-management/DeviceEnergyManagementServer.js";
import {
    DeviceEnergyManagementModeServer as BaseDeviceEnergyManagementModeServer
} from "../behaviors/device-energy-management-mode/DeviceEnergyManagementModeServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "#model";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Device Energy Management device provides reporting and optionally adjustment of the electrical power planned on
 * being consumed or produced by the device.
 *
 * DeviceEnergyManagementEndpoint requires DeviceEnergyManagement cluster but DeviceEnergyManagement is not added by
 * default because you must select the features your device supports. You can add manually using
 * DeviceEnergyManagementEndpoint.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 2.7
 */
export interface DeviceEnergyManagementEndpoint extends Identity<typeof DeviceEnergyManagementEndpointDefinition> {}

export namespace DeviceEnergyManagementRequirements {
    /**
     * The DeviceEnergyManagement cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link DeviceEnergyManagementServer} for convenience.
     */
    export const DeviceEnergyManagementServer = BaseDeviceEnergyManagementServer;

    /**
     * The DeviceEnergyManagementMode cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link DeviceEnergyManagementModeServer} for convenience.
     */
    export const DeviceEnergyManagementModeServer = BaseDeviceEnergyManagementModeServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { DeviceEnergyManagement: DeviceEnergyManagementServer },
        optional: { DeviceEnergyManagementMode: DeviceEnergyManagementModeServer }
    };
}

export const DeviceEnergyManagementEndpointDefinition = MutableEndpoint({
    name: "DeviceEnergyManagement",
    deviceType: 0x50d,
    deviceRevision: 2,
    deviceClass: DeviceClassification.Utility,
    requirements: DeviceEnergyManagementRequirements,
    behaviors: SupportedBehaviors()
});

export const DeviceEnergyManagementEndpoint: DeviceEnergyManagementEndpoint = DeviceEnergyManagementEndpointDefinition;
