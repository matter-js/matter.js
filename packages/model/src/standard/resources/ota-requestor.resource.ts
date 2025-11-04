/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "OtaRequestor", xref: "device§2.3",
    details: "An OTA Requestor is a device that is capable of receiving an OTA software update.",
    children: [
        { tag: "requirement", name: "OtaSoftwareUpdateRequestor", xref: "device§2.3.3" },
        { tag: "requirement", name: "OtaSoftwareUpdateProvider", xref: "device§2.3.3" }
    ]
});
