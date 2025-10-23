/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "MountedOnOffControl", classification: "simple", xref: "device§5.3",

    details: "A Mounted On/Off Control is a fixed device that provides power to another device or power circuit " +
        "that is connected to it, and is capable of switching that provided power on or off." +
        "\n" +
        "This device type is intended for any wall-mounted or hardwired load controller, while On/Off Plug-in " +
        "Unit is intended only for smart plugs and other power switching devices that are not permanently " +
        "connected, and which can be unplugged from their power source." +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> Since this device type was added in Matter 1.4, for endpoints using this device type it is " +
        "  recommended to add the subset device type On/Off Plug-in Unit to the DeviceTypeList of the " +
        "  Descriptor cluster on the same endpoint for backward compatibility with existing clients." +
        "\n" +
        "See [ref_MountedOnOffClientGuidance] for client guidance with these two device types.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§5.3.4" },
        { tag: "requirement", name: "Groups", xref: "device§5.3.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§5.3.4" },
        { tag: "requirement", name: "OnOff", xref: "device§5.3.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§5.3.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§5.3.4" }
    ]
});
