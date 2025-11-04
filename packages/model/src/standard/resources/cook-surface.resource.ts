/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "CookSurface", xref: "device§13.7",
    details: "A Cook Surface device type represents a heating object on a cooktop or other similar device. It " +
        "shall only be used when composed as part of another device type.",
    children: [
        { tag: "requirement", name: "TemperatureControl", xref: "device§13.7.4" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§13.7.4" },
        { tag: "requirement", name: "OnOff", xref: "device§13.7.4" }
    ]
});
