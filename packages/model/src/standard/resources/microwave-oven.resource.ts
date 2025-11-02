/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "MicrowaveOven", classification: "simple", xref: "device§13.11",
    details: "This defines conformance to the Microwave Oven device type." +
        "\n" +
        "A Microwave Oven is a device with the primary function of heating foods and beverages using a " +
        "magnetron.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.11.6" },
        { tag: "requirement", name: "OperationalState", xref: "device§13.11.6" },
        { tag: "requirement", name: "FanControl", xref: "device§13.11.6" },
        { tag: "requirement", name: "MicrowaveOvenMode", xref: "device§13.11.6" },
        { tag: "requirement", name: "MicrowaveOvenControl", xref: "device§13.11.6" },
        { tag: "requirement", name: "OnOffLight", xref: "device§13.11.5" }
    ]
});
