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

        // Spec defines as an enum16 of standard namespace IDs.  The "namespace" datatype enumerates exactly these IDs,
        // at the width of the semantic tag's NamespaceID (enum8), which every standard namespace ID fits
        {
            tag: "attribute",
            name: "StandardNamespace",
            id: 0x1,
            type: "namespace",
        },
    ],
});
