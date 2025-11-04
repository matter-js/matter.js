/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "WaterValve", xref: "device§5.6",
    details: "This defines conformance to the Water Valve device type.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§5.6.4" },
        { tag: "requirement", name: "ValveConfigurationAndControl", xref: "device§5.6.4" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:serverCluster", xref: "device§5.6.4" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:clientCluster", xref: "device§5.6.4" }
    ]
});
