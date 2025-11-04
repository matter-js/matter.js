/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "PressureSensor", xref: "device§7.5",
    details: "A Pressure Sensor device measures and reports the pressure of a fluid.",
    children: [
        { tag: "requirement", name: "PressureMeasurement", xref: "device§7.5.4" },
        { tag: "requirement", name: "Identify", xref: "device§7.5.4" }
    ]
});
