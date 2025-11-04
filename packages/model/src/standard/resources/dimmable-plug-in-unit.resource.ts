/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "DimmablePlugInUnit", xref: "device§5.2",

    details: "A Dimmable Plug-In Unit is a device that provides power to another device that is plugged into it, " +
        "and is capable of being switched on or off and have its level adjusted. The Dimmable Plug-in Unit is " +
        "typically used to control a conventional non-communicating light through its mains connection using " +
        "phase cutting." +
        "\n" +
        "The Mounted Dimmable Load Control (added in Matter 1.4) has identical cluster requirements as the " +
        "Dimmable Plug-In Unit, and is marked as a superset of this device type (since Matter 1.4.2). For " +
        "devices intended to be mounted permanently, the Mounted Dimmable Load Control device type shall be " +
        "used, with the Dimmable Plug-In Unit device type optionally added to the DeviceTypeList of the " +
        "Descriptor cluster in addition to the Mounted Dimmable Load Control device type (see " +
        "[ref_MountedDimmableLoadControlServerGuidance])." +
        "\n" +
        "### Before Matter 1.4, mounted dimmable load control units typically used the Dimmable Plug-In Unit " +
        "device type. Clients can encounter devices which were made before or after these specification " +
        "updates. Therefore, clients SHOULD use the following heuristic to distinguish the type of physical " +
        "device based on the device type revision found on an endpoint (\"--\" means the device type is not " +
        "listed).",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§5.2.4" },
        { tag: "requirement", name: "Groups", xref: "device§5.2.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§5.2.4" },
        { tag: "requirement", name: "OnOff", xref: "device§5.2.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§5.2.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§5.2.4" }
    ]
});
