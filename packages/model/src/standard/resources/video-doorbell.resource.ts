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
        "doorbell with Video and Audio streaming.",
    children: [
        { tag: "requirement", name: "Camera", xref: "device§16.3.3" },
        { tag: "requirement", name: "Doorbell", xref: "device§16.3.3" }
    ]
});
