/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "AudioDoorbell", xref: "device§16.5",
    details: "An Audio Doorbell device is composed in all cases with a generic switch to provide a doorbell with " +
        "Audio only streaming.",

    children: [
        { tag: "requirement", name: "TlsCertificatesCond", xref: "device§16.5.3" },
        { tag: "requirement", name: "PowerSourceCond", xref: "device§16.5.3" },
        { tag: "requirement", name: "TimeSyncWithNtpcCond", xref: "device§16.5.3" },
        { tag: "requirement", name: "TlsClientCond", xref: "device§16.5.3" },
        { tag: "requirement", name: "Identify", xref: "device§16.5.4" },
        { tag: "requirement", name: "Switch", xref: "device§16.5.4" },
        { tag: "requirement", name: "CameraAvStreamManagement", xref: "device§16.5.4" },
        {
            tag: "requirement", name: "WebRtcTransportProvider", discriminator: "M:serverCluster",
            xref: "device§16.5.4"
        },
        {
            tag: "requirement", name: "WebRtcTransportProvider", discriminator: "O:clientCluster",
            xref: "device§16.5.4"
        },
        {
            tag: "requirement", name: "WebRtcTransportRequestor", discriminator: "O:serverCluster",
            xref: "device§16.5.4"
        },
        {
            tag: "requirement", name: "WebRtcTransportRequestor", discriminator: "M:clientCluster",
            xref: "device§16.5.4"
        },
        { tag: "requirement", name: "PushAvStreamTransport", xref: "device§16.5.4" },
        { tag: "requirement", name: "Chime", xref: "device§16.5.4" }
    ]
});
