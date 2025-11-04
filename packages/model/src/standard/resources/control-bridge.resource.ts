/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ControlBridge", xref: "device§6.4",
    details: "A Control Bridge is a controller device that, when bound to a lighting device such as an Extended " +
        "Color Light, is capable of being used to switch the device on or off, adjust the intensity of the " +
        "light being emitted and adjust the color of the light being emitted. In addition, a Control Bridge " +
        "device is capable of being used for setting scenes.",

    children: [
        { tag: "requirement", name: "Identify", discriminator: "M:serverCluster", xref: "device§6.4.4" },
        { tag: "requirement", name: "Identify", discriminator: "M:clientCluster", xref: "device§6.4.4" },
        { tag: "requirement", name: "Groups", xref: "device§6.4.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§6.4.4" },
        { tag: "requirement", name: "OnOff", xref: "device§6.4.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§6.4.4" },
        { tag: "requirement", name: "ColorControl", xref: "device§6.4.4" },
        { tag: "requirement", name: "IlluminanceMeasurement", xref: "device§6.4.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§6.4.4" }
    ]
});
