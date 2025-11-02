/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Oven", classification: "simple", xref: "device§13.9",
    details: "An oven represents a device that contains one or more cabinets, and optionally a single cooktop, " +
        "that are all capable of heating food. Examples of consumer products implementing this device type " +
        "include ovens, wall ovens, convection ovens, etc.",
    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.9.6" },
        { tag: "requirement", name: "TemperatureControlledCabinet", xref: "device§13.9.5" },
        { tag: "requirement", name: "Cooktop", xref: "device§13.9.5" }
    ]
});
