/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Fan", xref: "device§9.2",
    details: "A Fan device is typically standalone or mounted on a ceiling or wall and is used to circulate air in " +
        "a room.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§9.2.5" },
        { tag: "requirement", name: "Groups", xref: "device§9.2.5" },
        { tag: "requirement", name: "OnOff", xref: "device§9.2.5" },
        { tag: "requirement", name: "FanControl", xref: "device§9.2.5" },
        { tag: "requirement", name: "Thermostat", xref: "device§9.2.4" }
    ]
});
