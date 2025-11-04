/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ColorDimmerSwitch", xref: "device§6.3",
    details: "A Color Dimmer Switch is a controller device that, when bound to a lighting device such as an " +
        "Extended Color Light, is capable of being used to adjust the color of the light being emitted.",

    children: [
        { tag: "requirement", name: "Identify", discriminator: "M:serverCluster", xref: "device§6.3.4" },
        { tag: "requirement", name: "Identify", discriminator: "M:clientCluster", xref: "device§6.3.4" },
        { tag: "requirement", name: "Groups", xref: "device§6.3.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§6.3.4" },
        { tag: "requirement", name: "OnOff", xref: "device§6.3.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§6.3.4" },
        { tag: "requirement", name: "ColorControl", xref: "device§6.3.4" }
    ]
});
