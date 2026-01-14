/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "ModeSelect",

    children: [
        {
            tag: "datatype",
            name: "SemanticTagStruct",
            type: "struct",
            children: [
                { tag: "field", name: "MfgCode", id: 0x0, type: "vendor-id" },
                { tag: "field", name: "Value", id: 0x1, type: "uint16" },
            ],
        },

        // Spec defines as an enum8. We have the datatype "namespace" for exactly this enum, so let's use it.
        {
            tag: "attribute",
            name: "StandardNamespace",
            id: 0x1,
            type: "namespace",
        },
    ],
});
