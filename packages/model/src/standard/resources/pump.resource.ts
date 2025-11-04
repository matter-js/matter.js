/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Pump", xref: "device§5.5",
    details: "A Pump device is a pump that may have variable speed. It may have optional built-in sensors and a " +
        "regulation mechanism. It is typically used for pumping fluids like water.",

    children: [
        { tag: "requirement", name: "OnOff", xref: "device§5.5.4" },
        { tag: "requirement", name: "PumpConfigurationAndControl", xref: "device§5.5.4" },
        { tag: "requirement", name: "Identify", xref: "device§5.5.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§5.5.4" },
        { tag: "requirement", name: "Groups", xref: "device§5.5.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§5.5.4" },
        { tag: "requirement", name: "TemperatureMeasurement", discriminator: "O:serverCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "PressureMeasurement", discriminator: "O:serverCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:serverCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "TemperatureMeasurement", discriminator: "O:clientCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "PressureMeasurement", discriminator: "O:clientCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:clientCluster", xref: "device§5.5.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§5.5.4" }
    ]
});
