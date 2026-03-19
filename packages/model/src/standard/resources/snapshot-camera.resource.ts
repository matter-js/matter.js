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
        "the Capture Snapshot command in the Camera AV Stream Management cluster.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§16.6.6" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§16.6.6" },
        { tag: "requirement", name: "ZoneManagement", xref: "device§16.6.6" },
        { tag: "requirement", name: "CameraAvStreamManagement", xref: "device§16.6.6" },
        { tag: "requirement", name: "CameraAvSettingsUserLevelManagement", xref: "device§16.6.6" },
        { tag: "requirement", name: "OccupancySensor", xref: "device§16.6.4" }
    ]
});
