/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ElectricalSensor", xref: "device§2.6",
    details: "An Electrical Sensor device measures the electrical power and/or energy being imported and/or " +
        "exported.",
    children: [
        { tag: "requirement", name: "PowerTopology", xref: "device§2.6.4" },
        { tag: "requirement", name: "ElectricalPowerMeasurement", xref: "device§2.6.4" },
        { tag: "requirement", name: "ElectricalEnergyMeasurement", xref: "device§2.6.4" }
    ]
});
