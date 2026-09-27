/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "OnOffLight", xref: "device§4.1",

    details: "The On/Off Light is a lighting device that is capable of being switched on or off by means of a " +
        "bound controller device such as an On/Off Light Switch or a Dimmer Switch. In addition, an on/off " +
        "light is also capable of being switched by means of a bound occupancy sensor." +
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
        { tag: "requirement", name: "GroupcastListenerCond", xref: "device§4.1.4" },
        {
            tag: "requirement", name: "Identify", xref: "device§4.1.5",
            children: [{ tag: "requirement", name: "TriggerEffect", xref: "device§4.1.6" }]
        },
        { tag: "requirement", name: "Groups", xref: "device§4.1.5" },
        {
            tag: "requirement", name: "OnOff", xref: "device§4.1.5",
            children: [{ tag: "requirement", name: "LIGHTING", xref: "device§4.1.6" }]
        },

        {
            tag: "requirement", name: "LevelControl", xref: "device§4.1.5",

            children: [
                { tag: "requirement", name: "ONOFF", xref: "device§4.1.6" },
                { tag: "requirement", name: "LIGHTING", xref: "device§4.1.6" },
                { tag: "requirement", name: "CurrentLevel", xref: "device§4.1.6" },
                { tag: "requirement", name: "MinLevel", xref: "device§4.1.6" },
                { tag: "requirement", name: "MaxLevel", xref: "device§4.1.6" }
            ]
        },

        {
            tag: "requirement", name: "ScenesManagement", xref: "device§4.1.5",
            children: [{ tag: "requirement", name: "CopyScene", xref: "device§4.1.6" }]
        },
        { tag: "requirement", name: "OccupancySensing", xref: "device§4.1.5" }
    ]
});
