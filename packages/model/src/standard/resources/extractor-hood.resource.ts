/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ExtractorHood", xref: "device§13.10",

    details: "An Extractor Hood is a device that is generally installed above a cooking surface in residential " +
        "kitchens. An Extractor Hood's primary purpose is to reduce odors that arise during the cooking " +
        "process by either extracting the air above the cooking surface or by recirculating and filtering it. " +
        "It may also contain a light for illuminating the cooking surface." +
        "\n" +
        "Extractor Hoods may also be known by the following names:" +
        "\n" +
        "  - Hoods" +
        "\n" +
        "  - Extractor Fans" +
        "\n" +
        "  - Extractors" +
        "\n" +
        "  - Range Hoods" +
        "\n" +
        "  - Telescoping Hoods" +
        "\n" +
        "  - Telescoping Extractors" +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "An Extractor Hood is composed of other device types listed in this table subject to the conformance " +
        "column of the table. All devices used in compositions shall adhere to the disambiguation and " +
        "superset requirements of the System Model. Specifically, please note that the On/Off Light as listed " +
        "is a Superset Device Type as defined by the System Model (see Superset Device Types in MatterCore), " +
        "and so the rules defined in that section apply to the use of On/Off Light as a superset when " +
        "composed in this device type. Additional device types not listed in this table may also be included " +
        "in device compositions.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.10.5" },
        { tag: "requirement", name: "HepaFilterMonitoring", xref: "device§13.10.5" },
        { tag: "requirement", name: "ActivatedCarbonFilterMonitoring", xref: "device§13.10.5" },

        {
            tag: "requirement", name: "FanControl", xref: "device§13.10.5",
            children: [
                { tag: "requirement", name: "ROCKING", xref: "device§13.10.6" },
                { tag: "requirement", name: "WIND", xref: "device§13.10.6" },
                { tag: "requirement", name: "AIRFLOWDIRECTION", xref: "device§13.10.6" }
            ]
        },

        { tag: "requirement", name: "OnOffLight", xref: "device§13.10.4" }
    ]
});
