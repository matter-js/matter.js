/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ColorTemperatureLight", xref: "device§4.3",
    details: "A Color Temperature Light is a lighting device that is capable of being switched on or off, the " +
        "intensity of its light adjusted, and its color temperature adjusted by means of a bound controller " +
        "device such as a Color Dimmer Switch.",

    children: [
        { tag: "requirement", name: "GroupcastListenerCond", xref: "device§4.3.4" },
        {
            tag: "requirement", name: "Identify", xref: "device§4.3.5",
            children: [{ tag: "requirement", name: "TriggerEffect", xref: "device§4.3.6" }]
        },
        { tag: "requirement", name: "Groups", xref: "device§4.3.5" },
        {
            tag: "requirement", name: "OnOff", xref: "device§4.3.5",
            children: [{ tag: "requirement", name: "LIGHTING", xref: "device§4.3.6" }]
        },

        {
            tag: "requirement", name: "LevelControl", xref: "device§4.3.5",

            children: [
                { tag: "requirement", name: "ONOFF", xref: "device§4.3.6" },
                { tag: "requirement", name: "LIGHTING", xref: "device§4.3.6" },
                { tag: "requirement", name: "CurrentLevel", xref: "device§4.3.6" },
                { tag: "requirement", name: "MinLevel", xref: "device§4.3.6" },
                { tag: "requirement", name: "MaxLevel", xref: "device§4.3.6" }
            ]
        },

        {
            tag: "requirement", name: "ScenesManagement", xref: "device§4.3.5",
            children: [{ tag: "requirement", name: "CopyScene", xref: "device§4.3.6" }]
        },

        {
            tag: "requirement", name: "ColorControl", xref: "device§4.3.5",
            children: [
                { tag: "requirement", name: "COLORTEMPERATURE", xref: "device§4.3.6" },
                { tag: "requirement", name: "RemainingTime", xref: "device§4.3.6" }
            ]
        },

        { tag: "requirement", name: "OccupancySensing", xref: "device§4.3.5" }
    ]
});
