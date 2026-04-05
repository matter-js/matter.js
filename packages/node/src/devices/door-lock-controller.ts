/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DoorLockBehavior as BaseDoorLockBehavior } from "../behaviors/door-lock/DoorLockBehavior.js";
import { GroupsBehavior as BaseGroupsBehavior } from "../behaviors/groups/GroupsBehavior.js";
import {
    ScenesManagementBehavior as BaseScenesManagementBehavior
} from "../behaviors/scenes-management/ScenesManagementBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Door Lock Controller is a device capable of controlling a door lock.
 *
 * @see {@link MatterSpecification.v151.Device} § 8.2
 */
export interface DoorLockControllerDevice extends Identity<typeof DoorLockControllerDeviceDefinition> {}

export namespace DoorLockControllerRequirements {
    /**
     * The DoorLock cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link DoorLockBehavior} for convenience.
     */
    export const DoorLockBehavior = BaseDoorLockBehavior;

    /**
     * The Groups cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link GroupsBehavior} for convenience.
     */
    export const GroupsBehavior = BaseGroupsBehavior;

    /**
     * The ScenesManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ScenesManagementBehavior} for convenience.
     */
    export const ScenesManagementBehavior = BaseScenesManagementBehavior;

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { DoorLock: DoorLockBehavior },
        optional: { Groups: GroupsBehavior, ScenesManagement: ScenesManagementBehavior }
    };
}

export const DoorLockControllerDeviceDefinition = MutableEndpoint({
    name: "DoorLockController",
    deviceType: 0xb,
    deviceRevision: 3,
    requirements: DoorLockControllerRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(DoorLockControllerDeviceDefinition);
export const DoorLockControllerDevice: DoorLockControllerDevice = DoorLockControllerDeviceDefinition;
