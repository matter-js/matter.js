/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "FloodlightCamera", xref: "device§16.2",
    details: "A Floodlight Camera device is a composite device which combines a camera and a light, primarily used " +
        "in security use cases.",
    children: [
        { tag: "requirement", name: "OnOffLight", xref: "device§16.2.4" },
        { tag: "requirement", name: "Camera", xref: "device§16.2.4" }
    ]
});
