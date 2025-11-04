/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "LaundryDryer", xref: "device§13.6",
    details: "A Laundry Dryer represents a device that is capable of drying laundry items.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.6.4" },
        { tag: "requirement", name: "LaundryWasherMode", xref: "device§13.6.4" },
        { tag: "requirement", name: "OnOff", xref: "device§13.6.4" },
        { tag: "requirement", name: "LaundryDryerControls", xref: "device§13.6.4" },
        { tag: "requirement", name: "TemperatureControl", xref: "device§13.6.4" },
        { tag: "requirement", name: "OperationalState", xref: "device§13.6.4" }
    ]
});
