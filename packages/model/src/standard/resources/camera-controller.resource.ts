/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "CameraController", xref: "device§16.8",
    details: "A Camera controller device is a device that provides interfaces for controlling and managing camera " +
        "devices.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§16.8.3" },
        { tag: "requirement", name: "PowerSource", xref: "device§16.8.3" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§16.8.3" },
        { tag: "requirement", name: "ZoneManagement", xref: "device§16.8.3" },
        { tag: "requirement", name: "CameraAvStreamManagement", xref: "device§16.8.3" },
        { tag: "requirement", name: "CameraAvSettingsUserLevelManagement", xref: "device§16.8.3" },
        { tag: "requirement", name: "WebRtcTransportProvider", xref: "device§16.8.3" },
        { tag: "requirement", name: "WebRtcTransportRequestor", xref: "device§16.8.3" },
        { tag: "requirement", name: "PushAvStreamTransport", xref: "device§16.8.3" },
        { tag: "requirement", name: "TlsCertificateManagement", xref: "device§16.8.3" },
        { tag: "requirement", name: "TlsClientManagement", xref: "device§16.8.3" }
    ]
});
