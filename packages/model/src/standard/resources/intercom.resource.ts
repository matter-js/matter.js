/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Intercom", xref: "device§16.4",

    details: "An Intercom is a device which provides two-way on demand communication facilities between devices." +
        "\n" +
        "Examples include but are not limited to:" +
        "\n" +
        "  - Room to room systems in a house" +
        "\n" +
        "  - Entry door to individual units in a multi-tenet building",

    children: [
        { tag: "requirement", name: "TlsCertificatesCond", xref: "device§16.4.4" },
        { tag: "requirement", name: "PowerSourceCond", xref: "device§16.4.4" },
        { tag: "requirement", name: "TimeSyncWithNtpcCond", xref: "device§16.4.4" },
        { tag: "requirement", name: "TimeSyncWithClientCond", xref: "device§16.4.4" },
        { tag: "requirement", name: "TimeSyncWithTzCond", xref: "device§16.4.4" },
        { tag: "requirement", name: "Identify", xref: "device§16.4.5" },
        { tag: "requirement", name: "CameraAvStreamManagement", xref: "device§16.4.5" },
        { tag: "requirement", name: "CameraAvSettingsUserLevelManagement", xref: "device§16.4.5" },
        {
            tag: "requirement", name: "WebRtcTransportProvider", discriminator: "M:serverCluster",
            xref: "device§16.4.5"
        },
        {
            tag: "requirement", name: "WebRtcTransportProvider", discriminator: "M:clientCluster",
            xref: "device§16.4.5"
        },
        {
            tag: "requirement", name: "WebRtcTransportRequestor", discriminator: "M:serverCluster",
            xref: "device§16.4.5"
        },
        {
            tag: "requirement", name: "WebRtcTransportRequestor", discriminator: "M:clientCluster",
            xref: "device§16.4.5"
        }
    ]
});
