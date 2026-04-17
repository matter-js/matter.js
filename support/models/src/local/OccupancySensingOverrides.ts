/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "OccupancySensing",

    children: [
        // Bump to revision 7: Added OccupancyEvent feature
        { tag: "attribute", id: 0xfffd, name: "ClusterRevision", default: 7 },

        // New feature: OCCEVENT — supports generating OccupancyChanged events
        // Include existing features so the position-based merge preserves them
        {
            tag: "attribute",
            id: 0xfffc,
            name: "FeatureMap",
            children: [
                { tag: "field", name: "OTHER", constraint: "0" },
                { tag: "field", name: "PIR", constraint: "1" },
                { tag: "field", name: "US", constraint: "2" },
                { tag: "field", name: "PHY", constraint: "3" },
                { tag: "field", name: "AIR", constraint: "4" },
                { tag: "field", name: "RAD", constraint: "5" },
                { tag: "field", name: "RFS", constraint: "6" },
                { tag: "field", name: "VIS", constraint: "7" },
                {
                    tag: "field",
                    name: "OCCEVENT",
                    constraint: "9",
                    conformance: "P, M",
                    title: "OccupancyEvent",
                    details: "Supports generating OccupancyChanged events when occupancy state changes.",
                },
            ],
        },

        // OccupancyChanged event: conformance changes to require OCCEVENT feature
        {
            tag: "event",
            id: 0x00,
            name: "OccupancyChanged",
            conformance: "OCCEVENT, O",
            priority: "info",
            children: [
                {
                    tag: "field",
                    id: 0x0,
                    name: "Occupancy",
                    type: "OccupancyBitmap",
                    conformance: "M",
                },
            ],
        },
    ],
});
