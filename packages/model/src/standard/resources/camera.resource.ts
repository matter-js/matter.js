/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Camera", xref: "device§16.1",
    details: "A Camera device is a camera that provides interfaces for controlling and transporting captured " +
        "media, such as Audio, Video or Snapshots.",

    children: [
        { tag: "requirement", name: "TlsCertificatesCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "PowerSourceCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "TimeSyncWithNtpcCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "TimeSyncWithClientCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "TimeSyncWithTzCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "TlsClientCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "CameraAvStreamManagement", xref: "device§16.1.6" },
        {
            tag: "requirement", name: "WebRtcTransportProvider", discriminator: "M:serverCluster",
            xref: "device§16.1.6"
        },
        {
            tag: "requirement", name: "WebRtcTransportRequestor", discriminator: "M:clientCluster",
            xref: "device§16.1.6"
        },
        {
            tag: "requirement", name: "WebRtcTransportProvider", discriminator: "O:clientCluster",
            xref: "device§16.1.6"
        },
        {
            tag: "requirement", name: "WebRtcTransportRequestor", discriminator: "O:serverCluster",
            xref: "device§16.1.6"
        },
        { tag: "requirement", name: "PushAvStreamTransport", xref: "device§16.1.6" },
        { tag: "requirement", name: "CameraAvSettingsUserLevelManagement", xref: "device§16.1.6" },
        { tag: "requirement", name: "ZoneManagement", xref: "device§16.1.6" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§16.1.6" },
        { tag: "requirement", name: "Identify", xref: "device§16.1.6" },
        { tag: "requirement", name: "OccupancySensor", xref: "device§16.1.4" }
    ]
});
