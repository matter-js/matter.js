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
        "  - Entry door to individual units in a multi-tenant building" +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "An Intercom shall be composed of at least one endpoint with the Generic Switch device type as " +
        "defined by the conformance below. There may be more endpoints with other device types existing in " +
        "the Intercom. The Generic Switch shall model the mechanism used by the Intercom to trigger an alert " +
        "of the desired connected party." +
        "\n" +
        "All devices used in compositions shall adhere to the disambiguation and superset requirements of the " +
        "System Model." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "An Audio connection may be established with an instance of an Intercom in one of two ways:" +
        "\n" +
        "  - via WebRTC, with the Intercom acting as a WebRTC Transport Requestor Client." +
        "\n" +
        "  - via WebRTC, with a Controller acting as the WebRTC Transport Requestor and the Intercom, in this " +
        "instance, acting as a WebRTC Transport Provider Server. In this case, the Controller may trigger " +
        "the establishment of Audio through knowledge that there is user intent via subscriptions to the " +
        "attributes of the Generic Switch, or other means.",

    children: [
        { tag: "requirement", name: "TlsCertificatesCond", xref: "device§16.4.5" },
        { tag: "requirement", name: "PowerSourceCond", xref: "device§16.4.5" },
        { tag: "requirement", name: "TimeSyncWithNtpcCond", xref: "device§16.4.5" },
        { tag: "requirement", name: "TimeSyncWithClientCond", xref: "device§16.4.5" },
        { tag: "requirement", name: "TimeSyncWithTzCond", xref: "device§16.4.5" },
        { tag: "requirement", name: "Identify", xref: "device§16.4.6" },

        {
            tag: "requirement", name: "CameraAvStreamManagement", xref: "device§16.4.6",
            children: [
                { tag: "requirement", name: "AUDIO", xref: "device§16.4.7" },
                { tag: "requirement", name: "VIDEO", xref: "device§16.4.7" },
                { tag: "requirement", name: "SNAPSHOT", xref: "device§16.4.7" }
            ]
        },

        { tag: "requirement", name: "CameraAvSettingsUserLevelManagement", xref: "device§16.4.6" },
        {
            tag: "requirement", name: "WebRtcTransportProvider", discriminator: "M:serverCluster",
            xref: "device§16.4.6"
        },
        {
            tag: "requirement", name: "WebRtcTransportProvider", discriminator: "M:clientCluster",
            xref: "device§16.4.6"
        },
        {
            tag: "requirement", name: "WebRtcTransportRequestor", discriminator: "M:serverCluster",
            xref: "device§16.4.6"
        },
        {
            tag: "requirement", name: "WebRtcTransportRequestor", discriminator: "M:clientCluster",
            xref: "device§16.4.6"
        },
        { tag: "requirement", name: "Chime", xref: "device§16.4.6" },

        {
            tag: "requirement", name: "GenericSwitch", xref: "device§16.4.4",
            children: [{
                tag: "requirement", name: "Switch",
                children: [{ tag: "requirement", name: "MOMENTARYSWITCH", xref: "device§16.4.8" }]
            }]
        }
    ]
});
