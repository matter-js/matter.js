/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "DimmableLight", xref: "device§4.2",
    details: "A Dimmable Light is a lighting device that is capable of being switched on or off and the intensity " +
        "of its light adjusted by means of a bound controller device such as a Dimmer Switch or a Color " +
        "Dimmer Switch. In addition, a Dimmable Light device is also capable of being switched by means of a " +
        "bound occupancy sensor or other device(s).",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§4.2.4" },
        { tag: "requirement", name: "Groups", xref: "device§4.2.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§4.2.4" },
        { tag: "requirement", name: "OnOff", xref: "device§4.2.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§4.2.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§4.2.4" }
    ]
});
