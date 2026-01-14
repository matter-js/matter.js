/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "FanControl",

    //Datatype(
    //             { name: "FanModeEnum", type: "enum8", xref: "cluster§4.4.5.5" },
    //             Field({ name: "Off", id: 0x0, conformance: "M", description: "Fan is off" }),
    //             Field({ name: "Low", id: 0x1, conformance: "O", description: "Fan using low speed" }),
    //             Field({ name: "Medium", id: 0x2, conformance: "[Low]", description: "Fan using medium speed" }),
    //             Field({ name: "High", id: 0x3, conformance: "M", description: "Fan using high speed" }),
    //             Field({ name: "On", id: 0x4, conformance: "D" }),
    //             Field({ name: "Auto", id: 0x5, conformance: "AUT", description: "Fan is using auto mode" }),
    //             Field({ name: "Smart", id: 0x6, conformance: "D", description: "Fan is using smart mode" })
    //         ),
    children: [
        // Set NameSupport default to match feature default per the specification
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
