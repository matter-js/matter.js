/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "WindowCovering", xref: "device§8.3",

    details: "This defines conformance to the Window Covering device type." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "Furthermore, in revision at or before revision 5 for this device type, either or both of the Closure " +
        "Control cluster and the Closure Dimension cluster shall NOT appear on the same endpoint. This is to " +
        "avoid potential future usage of the closely related Closure Control cluster in this device type from " +
        "interfering with non-standard usage of that cluster until proper data dependency language can be " +
        "introduced, if any.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§8.3.4" },
        { tag: "requirement", name: "Groups", xref: "device§8.3.4" },
        { tag: "requirement", name: "WindowCovering", xref: "device§8.3.4" },
        { tag: "requirement", name: "ClosureControl", xref: "device§8.3.4" },
        { tag: "requirement", name: "ClosureDimension", xref: "device§8.3.4" }
    ]
});
