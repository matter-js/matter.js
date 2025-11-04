/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "TemperatureSensor", xref: "device§7.4",
    details: "A Temperature Sensor device reports measurements of temperature.",
    children: [
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§7.4.4" },
        { tag: "requirement", name: "Identify", xref: "device§7.4.4" }
    ]
});
