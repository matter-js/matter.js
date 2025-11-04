/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ThermostatController", xref: "device§9.4",
    details: "A Thermostat Controller is a device capable of controlling a Thermostat.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§9.4.4" },
        { tag: "requirement", name: "Groups", xref: "device§9.4.4" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§9.4.4" },
        { tag: "requirement", name: "Thermostat", xref: "device§9.4.4" }
    ]
});
