/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BindingServer as BaseBindingServer } from "../behaviors/binding/BindingServer.js";
import { DoorLockClient as BaseDoorLockClient } from "../behaviors/door-lock/DoorLockClient.js";
import { GroupsClient as BaseGroupsClient } from "../behaviors/groups/GroupsClient.js";
import {
    ScenesManagementClient as BaseScenesManagementClient
} from "../behaviors/scenes-management/ScenesManagementClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Door Lock Controller is a device capable of controlling a door lock.
 *
 * @see {@link MatterSpecification.v161.Device} § 8.2
 */
export interface DoorLockControllerDevice extends Identity<typeof DoorLockControllerDeviceDefinition> {}

export namespace DoorLockControllerRequirements {
    /**
     * The Binding cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link BindingServer} for convenience.
     */
    export const BindingServer = BaseBindingServer;

    /**
     * The DoorLock cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link DoorLockClient} for convenience.
     */
    export const DoorLockClient = BaseDoorLockClient;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsClient} for convenience.
     */
    export const GroupsClient = BaseGroupsClient;

    /**
     * The ScenesManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementClient} for convenience.
     */
    export const ScenesManagementClient = BaseScenesManagementClient;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { Binding: BindingServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { DoorLock: DoorLockClient },
        optional: { Groups: GroupsClient, ScenesManagement: ScenesManagementClient }
    };
}

export const DoorLockControllerDeviceDefinition = MutableEndpoint({
    name: "DoorLockController",
    deviceType: 0xb,
    deviceRevision: 4,
    requirements: DoorLockControllerRequirements,
    behaviors: SupportedBehaviors(DoorLockControllerRequirements.server.mandatory.Binding)
});

Object.freeze(DoorLockControllerDeviceDefinition);
export const DoorLockControllerDevice: DoorLockControllerDevice = DoorLockControllerDeviceDefinition;
