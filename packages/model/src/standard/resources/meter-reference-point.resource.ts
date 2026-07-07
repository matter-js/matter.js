/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "MeterReferencePoint", xref: "device§14.6",
    details: "A Meter Reference Point device provides details about tariffs and metering.",

    children: [
        { tag: "requirement", name: "TimeSyncCond", xref: "device§14.6.4" },
        { tag: "requirement", name: "Identify", xref: "device§14.6.5" },
        { tag: "requirement", name: "ElectricalEnergyTariff", xref: "device§14.6.6" },
        { tag: "requirement", name: "ElectricalMeter", xref: "device§14.6.6" },
        { tag: "condition", name: "ElectricalEnergy", description: "See description below.", xref: "device§14.6.3" }
    ]
});
