/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "WindowCoveringController", xref: "device§8.4",
    details: "A Window Covering Controller is a device that controls an automatic window covering.",

    children: [
        { tag: "requirement", name: "Identify", discriminator: "O:serverCluster", xref: "device§8.4.4" },
        { tag: "requirement", name: "Identify", discriminator: "O:clientCluster", xref: "device§8.4.4" },
        { tag: "requirement", name: "Groups", xref: "device§8.4.4" },
        { tag: "requirement", name: "WindowCovering", xref: "device§8.4.4" }
    ]
});
