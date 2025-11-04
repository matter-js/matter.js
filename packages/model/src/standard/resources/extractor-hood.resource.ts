/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ExtractorHood", xref: "device§13.10",

    details: "An Extractor Hood is a device that is generally installed above a cooking surface in residential " +
        "kitchens. An Extractor Hood’s primary purpose is to reduce odors that arise during the cooking " +
        "process by either extracting the air above the cooking surface or by recirculating and filtering it. " +
        "It may also contain a light for illuminating the cooking surface." +
        "\n" +
        "Extractor Hoods may also be known by the following names:" +
        "\n" +
        "  • Hoods" +
        "\n" +
        "  • Extractor Fans" +
        "\n" +
        "  • Extractors" +
        "\n" +
        "  • Range Hoods" +
        "\n" +
        "  • Telescoping Hoods" +
        "\n" +
        "  • Telescoping Extractors",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.10.5" },
        { tag: "requirement", name: "HepaFilterMonitoring", xref: "device§13.10.5" },
        { tag: "requirement", name: "ActivatedCarbonFilterMonitoring", xref: "device§13.10.5" },
        { tag: "requirement", name: "FanControl", xref: "device§13.10.5" },
        { tag: "requirement", name: "OnOffLight", xref: "device§13.10.4" }
    ]
});
