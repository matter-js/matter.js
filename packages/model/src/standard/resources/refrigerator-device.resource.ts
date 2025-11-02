/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Refrigerator", classification: "simple", xref: "device§13.2",
    details: "A refrigerator represents a device that contains one or more cabinets that are capable of chilling " +
        "or freezing food. Examples of consumer products that may make use of this device type include " +
        "refrigerators, freezers, and wine coolers.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.2.6" },
        { tag: "requirement", name: "RefrigeratorAndTemperatureControlledCabinetMode", xref: "device§13.2.6" },
        { tag: "requirement", name: "RefrigeratorAlarm", xref: "device§13.2.6" },
        { tag: "requirement", name: "TemperatureControlledCabinet", xref: "device§13.2.5" }
    ]
});
