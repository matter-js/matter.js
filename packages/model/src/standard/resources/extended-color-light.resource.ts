/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ExtendedColorLight", xref: "device§4.4",
    details: "An Extended Color Light is a lighting device that is capable of being switched on or off, the " +
        "intensity of its light adjusted, and its color adjusted by means of a bound controller device such " +
        "as a Color Dimmer Switch or Control Bridge. The device supports adjustment of color by means of " +
        "hue/saturation, enhanced hue, color looping, XY coordinates, and color temperature. In addition, the " +
        "extended color light is also capable of being switched by means of a bound occupancy sensor.",

    children: [
        {
            tag: "requirement", name: "Identify", xref: "device§4.4.4",
            children: [{ tag: "requirement", name: "TriggerEffect", xref: "device§4.4.5" }]
        },
        { tag: "requirement", name: "Groups", xref: "device§4.4.4" },
        {
            tag: "requirement", name: "OnOff", xref: "device§4.4.4",
            children: [{ tag: "requirement", name: "LIGHTING", xref: "device§4.4.5" }]
        },

        {
            tag: "requirement", name: "LevelControl", xref: "device§4.4.4",

            children: [
                { tag: "requirement", name: "ONOFF", xref: "device§4.4.5" },
                { tag: "requirement", name: "LIGHTING", xref: "device§4.4.5" },
                { tag: "requirement", name: "CurrentLevel", xref: "device§4.4.5" },
                { tag: "requirement", name: "MinLevel", xref: "device§4.4.5" },
                { tag: "requirement", name: "MaxLevel", xref: "device§4.4.5" }
            ]
        },

        {
            tag: "requirement", name: "ScenesManagement", xref: "device§4.4.4",
            children: [{ tag: "requirement", name: "CopyScene", xref: "device§4.4.5" }]
        },

        {
            tag: "requirement", name: "ColorControl", xref: "device§4.4.4",

            children: [
                { tag: "requirement", name: "HUESATURATION", xref: "device§4.4.5" },
                { tag: "requirement", name: "ENHANCEDHUE", xref: "device§4.4.5" },
                { tag: "requirement", name: "COLORLOOP", xref: "device§4.4.5" },
                { tag: "requirement", name: "XY", xref: "device§4.4.5" },
                { tag: "requirement", name: "COLORTEMPERATURE", xref: "device§4.4.5" },
                { tag: "requirement", name: "RemainingTime", xref: "device§4.4.5" }
            ]
        },

        { tag: "requirement", name: "OccupancySensing", xref: "device§4.4.4" }
    ]
});
