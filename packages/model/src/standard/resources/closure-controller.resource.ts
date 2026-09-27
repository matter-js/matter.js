/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ClosureController", xref: "device§8.7",

    details: "A Closure Controller is capable of controlling a Closure." +
        "\n" +
        "### Introduction" +
        "\n" +
        "Two levels of control are available:" +
        "\n" +
        "  - Basic Level (Closure Control Cluster):" +
        "\n" +
        "  - Used for simple controller with buttons like wall switches." +
        "\n" +
        "  - Also all the general status and information remain at this level." +
        "\n" +
        "  - Advanced Level (Closure Dimension Cluster):" +
        "\n" +
        "  - Provides advanced information, controls and settings." +
        "\n" +
        "  - Used for advanced controller.",

    children: [
        { tag: "requirement", name: "GroupcastSenderCond", xref: "device§8.7.5" },
        { tag: "requirement", name: "Identify", xref: "device§8.7.6" },
        { tag: "requirement", name: "ClosureControl", xref: "device§8.7.6" },
        { tag: "requirement", name: "ClosureDimension", xref: "device§8.7.6" }
    ]
});
