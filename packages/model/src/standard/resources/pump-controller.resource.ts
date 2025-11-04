/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "PumpController", xref: "device§6.5",
    details: "A Pump Controller device is capable of configuring and controlling a Pump device.",

    children: [
        { tag: "requirement", name: "OnOff", xref: "device§6.5.4" },
        { tag: "requirement", name: "PumpConfigurationAndControl", xref: "device§6.5.4" },
        { tag: "requirement", name: "Identify", discriminator: "M:serverCluster", xref: "device§6.5.4" },
        { tag: "requirement", name: "Identify", discriminator: "O:clientCluster", xref: "device§6.5.4" },
        { tag: "requirement", name: "Groups", xref: "device§6.5.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§6.5.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§6.5.4" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§6.5.4" },
        { tag: "requirement", name: "PressureMeasurement", xref: "device§6.5.4" },
        { tag: "requirement", name: "FlowMeasurement", xref: "device§6.5.4" }
    ]
});
