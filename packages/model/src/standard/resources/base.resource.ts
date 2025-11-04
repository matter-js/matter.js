/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Base", xref: "device§1.1",

    children: [
        {
            tag: "field", name: "conditions",

            children: [
                { tag: "field", name: "Zha", description: "Zigbee Home Automation standard", xref: "device§1.1.3.1" },
                { tag: "field", name: "Zse", description: "Zigbee Smart Energy standard", xref: "device§1.1.3.1" },
                { tag: "field", name: "Gp", description: "Zigbee Green Power standard", xref: "device§1.1.3.1" },
                { tag: "field", name: "Zigbee", description: "Zigbee standard", xref: "device§1.1.3.1" },
                { tag: "field", name: "SuZi", description: "Zigbee PRO Sub-GHz standard", xref: "device§1.1.3.1" },
                { tag: "field", name: "Matter", description: "Matter standard", xref: "device§1.1.3.1" },
                {
                    tag: "field", name: "LanguageLocale",
                    description: "The node supports localization for conveying text to the user",
                    xref: "device§1.1.3.3"
                },
                {
                    tag: "field", name: "TimeLocale",
                    description: "The node supports localization for conveying time to the user",
                    xref: "device§1.1.3.3"
                },
                {
                    tag: "field", name: "UnitLocale",
                    description: "The node supports localization for conveying units of measure to the user",
                    xref: "device§1.1.3.3"
                },
                {
                    tag: "field", name: "Sit",
                    description: "The node is a short idle time intermittently connected device", xref: "device§1.1.4"
                },
                {
                    tag: "field", name: "Lit",
                    description: "The node is a long idle time intermittently connected device", xref: "device§1.1.4"
                },
                {
                    tag: "field", name: "Active", description: "The node is always able to communicate",
                    xref: "device§1.1.4"
                },
                { tag: "field", name: "Node", xref: "device§1.1.5" },
                { tag: "field", name: "App", xref: "device§1.1.5" },
                { tag: "field", name: "Simple", xref: "device§1.1.5" },
                { tag: "field", name: "Dynamic", xref: "device§1.1.5" },
                { tag: "field", name: "Composed", xref: "device§1.1.5" },
                { tag: "field", name: "Client", xref: "device§1.1.6" },
                { tag: "field", name: "Server", xref: "device§1.1.6" },
                { tag: "field", name: "Duplicate", xref: "device§1.1.6" },
                { tag: "field", name: "BridgedPowerSourceInfo", xref: "device§1.1.6" }
            ]
        },

        { tag: "requirement", name: "Descriptor", xref: "device§1.1.7" },
        { tag: "requirement", name: "Binding", xref: "device§1.1.7" },
        { tag: "requirement", name: "FixedLabel", xref: "device§1.1.7" },
        { tag: "requirement", name: "UserLabel", xref: "device§1.1.7" }
    ]
});
