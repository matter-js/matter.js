/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureMap } from "@matter/model";
import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "Scenes",
    until: "1.3",

    children: [
        // Enable scene names by default.  Not mandated by the specification but a reasonable default
        {
            tag: "attribute",
            id: FeatureMap.id,
            name: FeatureMap.name,
            children: [{ tag: "field", name: "SN", default: true }],
        },

        // Set NameSupport default to match feature default per the specification
        {
            tag: "attribute",
            id: 4,
            name: "NameSupport",
            children: [{ tag: "field", name: "NameSupport", default: true, constraint: "7" }],
        },

        // The following commands use the same fields as the unenhanced versions
        {
            tag: "command",
            id: 0x40,
            name: "EnhancedAddScene",
            type: "AddScene",
            direction: "request",
        },
        {
            tag: "command",
            id: 0x40,
            name: "EnhancedAddSceneResponse",
            type: "AddSceneResponse",
            direction: "response",
        },
        {
            tag: "command",
            id: 0x41,
            name: "EnhancedViewScene",
            type: "ViewScene",
            direction: "request",
        },
        {
            tag: "command",
            id: 0x41,
            name: "EnhancedViewSceneResponse",
            type: "ViewSceneResponse",
            direction: "response",
        },
    ],
});
