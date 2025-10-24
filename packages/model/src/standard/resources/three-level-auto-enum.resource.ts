/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "ThreeLevelAutoEnum", description: "Three-Level Auto Setting",
    xref: "core§7.19.2.50",
    details: "It is used for a three-level and Auto setting of an attribute on a device. This data type has four " +
        "values as enumerated below, and cannot be expanded.",

    children: [
        { tag: "field", name: "Auto", description: "Automatic Level" },
        { tag: "field", name: "Low", description: "Low Level" },
        { tag: "field", name: "Medium", description: "Medium Level" },
        { tag: "field", name: "High", description: "High Level" }
    ]
});
