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
        "media, such as Audio, Video or Snapshots." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Camera may expose elements of its functionality through one or more additional device types on " +
        "different endpoints. All devices used in compositions shall adhere to the disambiguation " +
        "requirements of the System Model. Other device types, not explicitly listed in the table, may also " +
        "be included in device compositions but are not considered part of the core functionality of the " +
        "device." +
        "\n" +
        "Cameras which implement occupancy detection based on the signals from the optical sensor, may expose " +
        "this functionality using an Occupancy Sensing cluster on the primary camera endpoint along with the " +
        "other camera functionality. The device type Occupancy Sensor shall NOT be added to the " +
        "DeviceTypeList of this endpoint." +
        "\n" +
        "Cameras may have an Occupancy Sensor of a different type for occupancy detection independent of the " +
        "optical sensor. If this sensor is exposed, it shall be placed on a child endpoint of the primary " +
        "camera endpoint, with the corresponding device type Occupancy Sensor, as indicated in the following " +
        "table:",

    children: [
        { tag: "requirement", name: "TlsCertificatesCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "PowerSourceCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "TimeSyncWithNtpcCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "TimeSyncWithClientCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "TimeSyncWithTzCond", xref: "device§16.1.5" },
        { tag: "requirement", name: "TlsClientCond", xref: "device§16.1.5" },

        {
            tag: "requirement", name: "CameraAvStreamManagement", xref: "device§16.1.6",
            children: [
                { tag: "requirement", name: "VIDEO", xref: "device§16.1.7" },
                { tag: "requirement", name: "AUDIO", xref: "device§16.1.7" },
                { tag: "requirement", name: "SNAPSHOT", xref: "device§16.1.7" }
            ]
        },

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
        {
            tag: "requirement", name: "ZoneManagement", xref: "device§16.1.6",
            children: [{ tag: "requirement", name: "TWODIMENSIONALCARTESIANZONE", xref: "device§16.1.7" }]
        },
        { tag: "requirement", name: "OccupancySensing", xref: "device§16.1.6" },
        { tag: "requirement", name: "Identify", xref: "device§16.1.6" },
        { tag: "requirement", name: "OccupancySensor", xref: "device§16.1.4" }
    ]
});
