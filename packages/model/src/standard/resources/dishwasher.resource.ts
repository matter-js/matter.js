/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Dishwasher", xref: "device§13.5",
    details: "A dishwasher is a device that is generally installed in residential homes and is capable of washing " +
        "dishes, cutlery, and other items associate with food preparation and consumption. The device can be " +
        "permanently installed or portable and can have variety of filling and draining methods.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.5.4" },
        { tag: "requirement", name: "OnOff", xref: "device§13.5.4" },
        { tag: "requirement", name: "TemperatureControl", xref: "device§13.5.4" },
        { tag: "requirement", name: "DishwasherMode", xref: "device§13.5.4" },
        { tag: "requirement", name: "DishwasherAlarm", xref: "device§13.5.4" },
        { tag: "requirement", name: "OperationalState", xref: "device§13.5.4" }
    ]
});
