/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "OtaProvider", xref: "device§2.4",
    details: "An OTA Provider is a node that is capable of providing an OTA software update to other nodes on the " +
        "same fabric.",
    children: [
        { tag: "requirement", name: "OtaSoftwareUpdateRequestor", xref: "device§2.4.3" },
        { tag: "requirement", name: "OtaSoftwareUpdateProvider", xref: "device§2.4.3" }
    ]
});
