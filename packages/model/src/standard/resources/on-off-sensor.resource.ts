/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "OnOffSensor", xref: "device§7.8",
    details: "An On/Off Sensor is a measurement and sensing device that, when bound to a lighting device such as a " +
        "Dimmable Light, is capable of being used to switch the device on or off.",

    children: [
        { tag: "requirement", name: "Identify", discriminator: "M:serverCluster", xref: "device§7.8.4" },
        { tag: "requirement", name: "Identify", discriminator: "M:clientCluster", xref: "device§7.8.4" },
        { tag: "requirement", name: "Groups", xref: "device§7.8.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§7.8.4" },
        { tag: "requirement", name: "OnOff", xref: "device§7.8.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§7.8.4" },
        { tag: "requirement", name: "ColorControl", xref: "device§7.8.4" }
    ]
});
