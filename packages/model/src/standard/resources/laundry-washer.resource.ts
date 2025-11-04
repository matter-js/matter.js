/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "LaundryWasher", xref: "device§13.1",
    details: "A Laundry Washer represents a device that is capable of laundering consumer items. Any laundry " +
        "washer product may utilize this device type." +
        "\n" +
        "A Laundry Washer shall be composed of at least one endpoint with the Laundry Washer device type.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.1.4" },
        { tag: "requirement", name: "LaundryWasherMode", xref: "device§13.1.4" },
        { tag: "requirement", name: "OnOff", xref: "device§13.1.4" },
        { tag: "requirement", name: "LaundryWasherControls", xref: "device§13.1.4" },
        { tag: "requirement", name: "TemperatureControl", xref: "device§13.1.4" },
        { tag: "requirement", name: "OperationalState", xref: "device§13.1.4" }
    ]
});
