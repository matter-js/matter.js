/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "MountedOnOffControl", xref: "device§5.3",

    details: "A Mounted On/Off Control is a fixed device that provides power to another device or power circuit " +
        "that is connected to it, and is capable of switching that provided power on or off." +
        "\n" +
        "This device type is intended for any wall-mounted or hardwired load controller, while On/Off Plug-in " +
        "Unit is intended only for smart plugs and other power switching devices that are not permanently " +
        "connected, and which can be unplugged from their power source." +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> NOTE: Since this device type was added in Matter 1.4, for endpoints using this device type it is " +
        "recommended to add the subset device type On/Off Plug-in Unit to the DeviceTypeList of the " +
        "Descriptor cluster on the same endpoint for backward compatibility with existing clients. See " +
        "On/Off Plug-in Unit client guidance for additional information, regarding the inclusion of these " +
        "two device types." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "The inclusion of the Level Control cluster on this device is recommended to provide a consistent " +
        "user experience when the device is grouped with additional dimmable lights and the “with on/off” " +
        "commands are used. For this device, since its only states are on or off, if the Level Control " +
        "cluster is implemented, it shall NOT have any effect on the actual light level except for those " +
        "commands that cause an on/off state change, that is, the “with on/off” commands. In addition, if the " +
        "Level Control cluster is implemented, the device shall accept and process Level Control cluster " +
        "commands, adjusting the value of the CurrentLevel attribute accordingly and, where necessary, " +
        "adjusting the On/Off cluster OnOff attribute." +
        "\n" +
        "### Element Requirements" +
        "\n" +
        "As the TriggerEffect command of the Identify cluster and the OffWithEffect command of the On/Off " +
        "cluster specify light effects that require dimming of the light output, and such is not possible on " +
        "this device type, the specified light effects may be replaced by pure on/off light effects.",

    children: [
        {
            tag: "requirement", name: "Identify", xref: "device§5.3.4",
            children: [{ tag: "requirement", name: "TriggerEffect", xref: "device§5.3.5" }]
        },
        { tag: "requirement", name: "Groups", xref: "device§5.3.4" },
        {
            tag: "requirement", name: "OnOff", xref: "device§5.3.4",
            children: [{ tag: "requirement", name: "LIGHTING", xref: "device§5.3.5" }]
        },

        {
            tag: "requirement", name: "LevelControl", xref: "device§5.3.4",

            children: [
                { tag: "requirement", name: "ONOFF", xref: "device§5.3.5" },
                { tag: "requirement", name: "LIGHTING", xref: "device§5.3.5" },
                { tag: "requirement", name: "CurrentLevel", xref: "device§5.3.5" },
                { tag: "requirement", name: "MinLevel", xref: "device§5.3.5" },
                { tag: "requirement", name: "MaxLevel", xref: "device§5.3.5" }
            ]
        },

        {
            tag: "requirement", name: "ScenesManagement", xref: "device§5.3.4",
            children: [{ tag: "requirement", name: "CopyScene", xref: "device§5.3.5" }]
        },
        { tag: "requirement", name: "OccupancySensing", xref: "device§5.3.4" }
    ]
});
