/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "IrrigationSystem", xref: "device§5.7",

    details: "This defines conformance to the Irrigation System device type. An irrigation system is used to " +
        "control a group of irrigation zones to water landscape. Irrigation systems are also commonly " +
        "referred to as \"Sprinkler Controllers\" since they are often used in residential and commercial " +
        "settings to control and schedule in-ground sprinkler systems for lawns. A physical irrigation system " +
        "typically has a set of electrical terminals to which in-ground water valves are connected so that " +
        "the system can actuate them.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§5.7.6" },
        { tag: "requirement", name: "OperationalState", xref: "device§5.7.6" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:serverCluster", xref: "device§5.7.6" },
        { tag: "requirement", name: "FlowMeasurement", discriminator: "O:clientCluster", xref: "device§5.7.6" },
        { tag: "requirement", name: "WaterValve", xref: "device§5.7.5" }
    ]
});
