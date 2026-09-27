/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ClosurePanel", xref: "device§8.6",

    details: "A Closure Panel shall ONLY exist as a part (child) of a Closure device type. It represents a single " +
        "panel aspect (e.g. position of a blind, tilt of slats, etc) within that Closure." +
        "\n" +
        "This panel can be used to express the following:" +
        "\n" +
        "  - Translation : panel translates along one axis" +
        "\n" +
        "  - Rotation : panel rotates around an axis of rotation" +
        "\n" +
        "  - Modulation : panel modifies its aspect to modulate a flow" +
        "\n" +
        "A Closure Panel shall use exactly one semantic tag from the ClosurePanel namespace (0x45) in the " +
        "TagList attribute of the Descriptor cluster to describe the spatial aspect of the dimension, e.g., " +
        "\"Lift\", \"Tilt\", etc." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "The Window Covering cluster shall NOT be present on the same endpoint for this device type. This " +
        "restriction prevents conflicts between potential future standardized use of the Window Covering " +
        "cluster and any existing non-standard implementations, until appropriate data dependency language is " +
        "defined." +
        "\n" +
        "### Element Requirements" +
        "\n" +
        "The TagList in the Descriptor cluster of an endpoint with this device type shall meet the following " +
        "constraints:" +
        "\n" +
        "  - There shall be exactly one tag from the ClosurePanel namespace (namespace 0x45)." +
        "\n" +
        "  - There shall NOT be any tag from the Closure namespace (namespace 0x44).",

    children: [
        {
            tag: "requirement", name: "Descriptor",
            children: [{ tag: "requirement", name: "TAGLIST", xref: "device§8.6.4" }]
        },
        { tag: "requirement", name: "WindowCovering", xref: "device§8.6.3" },
        { tag: "requirement", name: "ClosureControl", xref: "device§8.6.3" },
        { tag: "requirement", name: "ClosureDimension", xref: "device§8.6.3" }
    ]
});
