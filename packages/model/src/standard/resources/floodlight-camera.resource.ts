/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "FloodlightCamera", xref: "device§16.2",

    details: "A Floodlight Camera device is a composite device which combines a camera and a light, primarily used " +
        "in security use cases." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Floodlight Camera is composed of other device types listed in this table subject to the " +
        "conformance column of the table. All devices used in compositions shall adhere to the disambiguation " +
        "and superset requirements of the System Model. Specifically, please note that the On/Off Light, as " +
        "listed, is a Superset Device Type as defined by the System Model (see Superset Device Types in " +
        "MatterCore), and so the rules defined in that section apply to the use of On/Off Light as a superset " +
        "when composed in this device type. Additional device types not listed in this table may also be " +
        "included in device compositions.",

    children: [
        { tag: "requirement", name: "OnOffLight", xref: "device§16.2.4" },
        { tag: "requirement", name: "Camera", xref: "device§16.2.4" }
    ]
});
