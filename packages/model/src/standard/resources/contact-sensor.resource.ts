/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ContactSensor", xref: "device§7.1",
    details: "This defines conformance to the Contact Sensor device type.",
    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.1.4" },
        { tag: "requirement", name: "BooleanState", xref: "device§7.1.4" },
        { tag: "requirement", name: "BooleanStateConfiguration", xref: "device§7.1.4" }
    ]
});
