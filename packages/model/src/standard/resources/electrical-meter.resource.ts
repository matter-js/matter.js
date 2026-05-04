/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ElectricalMeter", xref: "device§14.8",
    details: "An Electrical Meter device meters the electrical energy being imported and/or exported for billing " +
        "purposes.",

    children: [
        { tag: "requirement", name: "CommodityMetering", xref: "device§14.8.4" },
        { tag: "requirement", name: "ElectricalPowerMeasurement", xref: "device§14.8.4" },
        { tag: "requirement", name: "ElectricalEnergyMeasurement", xref: "device§14.8.4" },
        { tag: "requirement", name: "ElectricalSensor", xref: "device§14.8.3" }
    ]
});
