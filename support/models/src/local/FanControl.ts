/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "FanControl",

    children: [
        // Override the conformance of "Medium" (according to spec it's "[Low]" which can never be validated for an enum)
        {
            tag: "datatype",
            name: "FanModeEnum",
            children: [
                { tag: "field", name: "Off", conformance: "M", id: 0x0, description: "Fan is off" },
                { tag: "field", name: "Low", conformance: "O", id: 0x1, description: "Fan using low speed" },
                {
                    tag: "field",
                    name: "Medium",
                    conformance: "O",
                    id: 0x2,
                    description: "Fan using medium speed",
                },
                { tag: "field", name: "High", conformance: "M", id: 0x3, description: "Fan using high speed" },
                { tag: "field", name: "On", conformance: "D", id: 0x4 },
                {
                    tag: "field",
                    name: "Auto",
                    conformance: "AUT",
                    id: 0x5,
                    description: "Fan is using auto mode",
                },
                {
                    tag: "field",
                    name: "Smart",
                    conformance: "D",
                    id: 0x6,
                    description: "Fan is using smart mode",
                },
            ],
        },
    ],
});
