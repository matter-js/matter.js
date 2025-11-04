/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "DeviceEnergyManagement", xref: "device§2.7",
    details: "A Device Energy Management device provides reporting and optionally adjustment of the electrical " +
        "power planned on being consumed or produced by the device.",

    children: [
        { tag: "requirement", name: "DeviceEnergyManagement", xref: "device§2.7.4" },
        { tag: "requirement", name: "DeviceEnergyManagementMode", xref: "device§2.7.4" },

        {
            tag: "field", name: "conditions",
            children: [{
                tag: "field", name: "ControllableEsa",
                description: "The DEM cluster on this endpoint accepts commands to adjust its energy operation.",
                xref: "device§2.7.3"
            }]
        }
    ]
});
