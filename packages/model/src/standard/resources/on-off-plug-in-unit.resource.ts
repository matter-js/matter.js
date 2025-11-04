/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "OnOffPlugInUnit", xref: "device§5.1",

    details: "An On/Off Plug-in Unit is a device that provides power to another device that is plugged into it, " +
        "and is capable of switching that provided power on or off." +
        "\n" +
        "The Mounted On/Off Control (added in Matter 1.4) has identical cluster requirements as the On/Off " +
        "Plug-In Unit, and is marked as superset of this device type (since Matter 1.4.2). For devices " +
        "intended to be mounted permanently, the Mounted On/Off Control device type shall be used, with the " +
        "On/Off Plug-In Unit device type optionally added in the DeviceTypeList of the Descriptor cluster in " +
        "addition to the On/Off Plug-In Unit device type (see [ref_MountedOnOffControlServerGuidance])." +
        "\n" +
        "### Before Matter 1.4, mounted units typically used the On/Off Plug-In Unit device type. Clients can " +
        "encounter devices which were made before or after these specification updates. Therefore, clients " +
        "SHOULD use the following heuristic to distinguish the type of physical device based on the device " +
        "type revision found on an endpoint (\"--\" means the device type is not listed).",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§5.1.4" },
        { tag: "requirement", name: "Groups", xref: "device§5.1.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§5.1.4" },
        { tag: "requirement", name: "OnOff", xref: "device§5.1.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§5.1.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§5.1.4" }
    ]
});
