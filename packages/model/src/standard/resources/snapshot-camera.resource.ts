/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "SnapshotCamera", xref: "device§16.6",

    details: "A Snapshot Camera device is a camera which can only support retrieving still images on-demand via " +
        "the Capture Snapshot command in the Camera AV Stream Management cluster." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Snapshot Camera may expose elements of its functionality through one or more additional device " +
        "types on different endpoints. All devices used in compositions shall adhere to the disambiguation " +
        "requirements of the System Model. Other device types, not explicitly listed in the table, may also " +
        "be included in device compositions but are not considered part of the core functionality of the " +
        "device." +
        "\n" +
        "Snapshot Cameras which implement occupancy detection based on the signals from the optical sensor, " +
        "may expose this functionality using an Occupancy Sensing cluster on the primary camera endpoint " +
        "along with the other camera functionality. The device type Occupancy Sensor shall NOT be added to " +
        "the DeviceTypeList of this endpoint." +
        "\n" +
        "Snapshot Cameras may have an Occupancy Sensor of a different type for occupancy detection " +
        "independent of the optical sensor. If this sensor is exposed, it shall be placed on a child endpoint " +
        "of the primary camera endpoint, with the corresponding device type Occupancy Sensor, as indicated in " +
        "the following table:",

    children: [
        { tag: "requirement", name: "PowerSourceCond", xref: "device§16.6.5" },
        { tag: "requirement", name: "TimeSyncWithTzCond", xref: "device§16.6.5" },
        { tag: "requirement", name: "Identify", xref: "device§16.6.6" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§16.6.6" },
        {
            tag: "requirement", name: "ZoneManagement", xref: "device§16.6.6",
            children: [{ tag: "requirement", name: "TWODIMENSIONALCARTESIANZONE", xref: "device§16.6.7" }]
        },

        {
            tag: "requirement", name: "CameraAvStreamManagement", xref: "device§16.6.6",
            children: [
                { tag: "requirement", name: "SNAPSHOT", xref: "device§16.6.7" },
                { tag: "requirement", name: "VIDEO", xref: "device§16.6.7" },
                { tag: "requirement", name: "AUDIO", xref: "device§16.6.7" }
            ]
        },

        { tag: "requirement", name: "CameraAvSettingsUserLevelManagement", xref: "device§16.6.6" },
        { tag: "requirement", name: "OccupancySensor", xref: "device§16.6.4" }
    ]
});
