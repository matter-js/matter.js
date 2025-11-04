/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "OccupancySensor", xref: "device§7.3",
    details: "An Occupancy Sensor is a measurement and sensing device that is capable of measuring and reporting " +
        "the occupancy state in a designated area.",
    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.3.4" },
        { tag: "requirement", name: "BooleanStateConfiguration", xref: "device§7.3.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§7.3.4" }
    ]
});
