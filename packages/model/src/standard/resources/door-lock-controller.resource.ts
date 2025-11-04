/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "DoorLockController", xref: "device§8.2",
    details: "A Door Lock Controller is a device capable of controlling a door lock.",

    children: [
        { tag: "requirement", name: "Groups", xref: "device§8.2.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§8.2.4" },
        { tag: "requirement", name: "TimeSynchronization", xref: "device§8.2.4" },
        { tag: "requirement", name: "DoorLock", xref: "device§8.2.4" }
    ]
});
