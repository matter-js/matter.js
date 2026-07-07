/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "SoilSensor", xref: "device§7.14",
    details: "A Soil Sensor device reports measurements of soil values, such as moisture and (optionally) " +
        "temperature.",
    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.14.4" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§7.14.4" },
        { tag: "requirement", name: "SoilMeasurement", xref: "device§7.14.4" }
    ]
});
