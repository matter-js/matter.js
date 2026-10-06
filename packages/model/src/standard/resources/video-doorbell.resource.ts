/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "VideoDoorbell", xref: "device§16.3",

    details: "A Video Doorbell device is a composite device which combines a camera and a switch to provide a " +
        "doorbell with Video and Audio streaming." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "This device type is composed of other device types listed in this table subject to the conformance " +
        "column of the table. All devices used in compositions shall adhere to the disambiguation and " +
        "superset requirements of the System Model. Additional device types not listed in this table may also " +
        "be included in device compositions.",

    children: [
        { tag: "requirement", name: "Camera", xref: "device§16.3.3" },
        { tag: "requirement", name: "Doorbell", xref: "device§16.3.3" }
    ]
});
