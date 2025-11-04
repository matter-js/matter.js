/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "DimmerSwitch", xref: "device§6.2",
    details: "A Dimmer Switch is a controller device that, when bound to a lighting device such as a Dimmable " +
        "Light, is capable of being used to switch the device on or off and adjust the intensity of the light " +
        "being emitted.",

    children: [
        { tag: "requirement", name: "Identify", discriminator: "M:serverCluster", xref: "device§6.2.4" },
        { tag: "requirement", name: "Identify", discriminator: "M:clientCluster", xref: "device§6.2.4" },
        { tag: "requirement", name: "Groups", xref: "device§6.2.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§6.2.4" },
        { tag: "requirement", name: "OnOff", xref: "device§6.2.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§6.2.4" }
    ]
});
