/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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
        "addition to the On/Off Plug-In Unit device type (see Mounted On/Off Control server guidance " +
        "section)." +
        "\n" +
        "Before Matter 1.4, mounted units typically used the On/Off Plug-In Unit device type. Clients can " +
        "encounter devices which were made before or after these specification updates. Therefore, clients " +
        "SHOULD use the following heuristic to distinguish the type of physical device based on the device " +
        "type revision found on an endpoint (\"--\" means the device type is not listed)." +
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
        { tag: "requirement", name: "GroupcastListenerCond", xref: "device§5.1.4" },
        {
            tag: "requirement", name: "Identify", xref: "device§5.1.5",
            children: [{ tag: "requirement", name: "TriggerEffect", xref: "device§5.1.6" }]
        },
        { tag: "requirement", name: "Groups", xref: "device§5.1.5" },
        {
            tag: "requirement", name: "OnOff", xref: "device§5.1.5",
            children: [{ tag: "requirement", name: "LIGHTING", xref: "device§5.1.6" }]
        },

        {
            tag: "requirement", name: "LevelControl", xref: "device§5.1.5",

            children: [
                { tag: "requirement", name: "ONOFF", xref: "device§5.1.6" },
                { tag: "requirement", name: "LIGHTING", xref: "device§5.1.6" },
                { tag: "requirement", name: "CurrentLevel", xref: "device§5.1.6" },
                { tag: "requirement", name: "MinLevel", xref: "device§5.1.6" },
                { tag: "requirement", name: "MaxLevel", xref: "device§5.1.6" }
            ]
        },

        {
            tag: "requirement", name: "ScenesManagement", xref: "device§5.1.5",
            children: [{ tag: "requirement", name: "CopyScene", xref: "device§5.1.6" }]
        },
        { tag: "requirement", name: "OccupancySensing", xref: "device§5.1.5" }
    ]
});
