/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "WaterFreezeDetector", xref: "device§7.11",
    details: "This defines conformance to the Water Freeze Detector device type.",
    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.11.4" },
        { tag: "requirement", name: "BooleanState", xref: "device§7.11.4" },
        { tag: "requirement", name: "BooleanStateConfiguration", xref: "device§7.11.4" }
    ]
});
