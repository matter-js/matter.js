/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "OnOffLight", xref: "device§4.1",
    details: "The On/Off Light is a lighting device that is capable of being switched on or off by means of a " +
        "bound controller device such as an On/Off Light Switch or a Dimmer Switch. In addition, an on/off " +
        "light is also capable of being switched by means of a bound occupancy sensor.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§4.1.4" },
        { tag: "requirement", name: "Groups", xref: "device§4.1.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§4.1.4" },
        { tag: "requirement", name: "OnOff", xref: "device§4.1.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§4.1.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§4.1.4" }
    ]
});
