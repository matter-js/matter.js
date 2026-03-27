/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Base", xref: "device§1.1",

    children: [
        {
            tag: "condition", name: "LanguageLocale",
            description: "The node supports localization for conveying text to the user",
            xref: "device§1.1.3.2"
        },
        {
            tag: "condition", name: "TimeLocale",
            description: "The node supports localization for conveying time to the user",
            xref: "device§1.1.3.2"
        },
        {
            tag: "condition", name: "UnitLocale",
            description: "The node supports localization for conveying units of measure to the user",
            xref: "device§1.1.3.2"
        },
        {
            tag: "condition", name: "Sit",
            description: "The node is a short idle time intermittently connected device", xref: "device§1.1.4"
        },
        {
            tag: "condition", name: "Lit",
            description: "The node is a long idle time intermittently connected device", xref: "device§1.1.4"
        },
        {
            tag: "condition", name: "Active", description: "The node is always able to communicate",
            xref: "device§1.1.4"
        },
        { tag: "condition", name: "Node", xref: "device§1.1.5" },
        { tag: "condition", name: "App", xref: "device§1.1.5" },
        { tag: "condition", name: "Simple", xref: "device§1.1.5" },
        { tag: "condition", name: "Dynamic", xref: "device§1.1.5" },
        { tag: "condition", name: "Composed", xref: "device§1.1.5" },
        { tag: "condition", name: "Client", xref: "device§1.1.6" },
        { tag: "condition", name: "Server", xref: "device§1.1.6" },
        { tag: "condition", name: "Duplicate", xref: "device§1.1.6" },
        { tag: "condition", name: "BridgedPowerSourceInfo", xref: "device§1.1.6" },
        { tag: "requirement", name: "Descriptor", xref: "device§1.1.7" },
        { tag: "requirement", name: "Binding", xref: "device§1.1.7" },
        { tag: "requirement", name: "FixedLabel", xref: "device§1.1.7" },
        { tag: "requirement", name: "UserLabel", xref: "device§1.1.7" }
    ]
});
