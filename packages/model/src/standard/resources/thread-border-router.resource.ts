/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ThreadBorderRouter", xref: "device§15.4",

    details: "A Thread Border Router device type provides interfaces for querying and configuring the associated " +
        "Thread network." +
        "\n" +
        "Instances of physical devices categorized as Thread Border Routers encompass standalone Thread " +
        "Border Routers, conventional application devices like smart speakers, media streamers, and lighting " +
        "fixtures equipped with a Thread Border Router, as well as Wi-Fi Routers incorporating Thread Border " +
        "Router functionality." +
        "\n" +
        "The necessary hardware and software prerequisites are detailed within the clusters that are mandated " +
        "by this device type.",

    children: [
        { tag: "requirement", name: "ThreadNetworkDiagnostics", xref: "device§15.4.5" },
        { tag: "requirement", name: "ThreadBorderRouterManagement", xref: "device§15.4.5" },
        { tag: "requirement", name: "ThreadNetworkDirectory", xref: "device§15.4.5" },
        { tag: "requirement", name: "SecondaryNetworkInterface", xref: "device§15.4.4" }
    ]
});
