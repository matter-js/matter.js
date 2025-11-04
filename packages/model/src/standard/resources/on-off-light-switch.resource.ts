/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "OnOffLightSwitch", xref: "device§6.1",
    details: "An On/Off Light Switch is a controller device that, when bound to a lighting device such as an " +
        "On/Off Light, is capable of being used to switch the device on or off.",

    children: [
        { tag: "requirement", name: "Identify", discriminator: "M:serverCluster", xref: "device§6.1.4" },
        { tag: "requirement", name: "Identify", discriminator: "M:clientCluster", xref: "device§6.1.4" },
        { tag: "requirement", name: "Groups", xref: "device§6.1.4" },
        { tag: "requirement", name: "OnOff", xref: "device§6.1.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§6.1.4" }
    ]
});
