/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "MountedDimmableLoadControl", classification: "simple", xref: "device§5.4",

    details: "A Mounted Dimmable Load Control is a fixed device that provides power to a load connected to it, and " +
        "is capable of being switched on or off and have its level adjusted. The Mounted Dimmable Load " +
        "Control is typically used to control a conventional non-communicating light through its mains " +
        "connection using phase cutting." +
        "\n" +
        "This device type is intended for any wall-mounted or hardwired dimmer-capable load controller, while " +
        "Dimmable Plug-In Unit is intended only for dimmer-capable smart plugs that are not permanently " +
        "connected, and which can be unplugged from their power source." +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> Since this device type was added in Matter 1.4, for endpoints using this device type" +
        "\n" +
        "it is recommended to add the subset device type Dimmable Plug-In Unit to the DeviceTypeList of the " +
        "Descriptor cluster on the same endpoint for backward compatibility with existing clients." +
        "\n" +
        "See [ref_MountedDimmablePlugInUnitClientGuidance] for client guidance with these two device types.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§5.4.4" },
        { tag: "requirement", name: "Groups", xref: "device§5.4.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§5.4.4" },
        { tag: "requirement", name: "OnOff", xref: "device§5.4.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§5.4.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§5.4.4" }
    ]
});
