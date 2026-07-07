/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Closure", xref: "device§8.5",

    details: "A Closure is an element that seals an opening (such as a window, door, cabinet, wall, facade, " +
        "ceiling, or roof). It may contain one or more instances of a Closure Panel device type on separate " +
        "child endpoints of the Closure parent. Each Closure Panel is a sub-component of a Closure, capable " +
        "of some change in state, primarily through a movement." +
        "\n" +
        "All the common characteristics of a Closure are gathered within Closure Control Cluster. Moving " +
        "parts or other physical aspects of the device are exposed using Closure Dimension Cluster.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§8.5.5" },
        { tag: "requirement", name: "WindowCovering", xref: "device§8.5.5" },
        { tag: "requirement", name: "ClosureControl", xref: "device§8.5.5" },
        { tag: "requirement", name: "ClosureDimension", xref: "device§8.5.5" },
        { tag: "requirement", name: "DoorLock", xref: "device§8.5.4" },
        { tag: "requirement", name: "OnOffLight", xref: "device§8.5.4" },
        { tag: "requirement", name: "ClosurePanel", xref: "device§8.5.4" }
    ]
});
