/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "DoorLock", xref: "device§8.1",
    details: "A Door Lock is a device used to secure a door. It is possible to actuate a door lock either by means " +
        "of a manual or a remote method.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§8.1.4" },
        { tag: "requirement", name: "Groups", xref: "device§8.1.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§8.1.4" },
        { tag: "requirement", name: "DoorLock", xref: "device§8.1.4" }
    ]
});
