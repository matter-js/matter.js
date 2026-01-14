/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "UserLabel",

    // Specs state "minimum 4" but means "needs to support 4 or more entries, but 0 is also ok"
    children: [
        {
            tag: "attribute",
            name: "LabelList",
            id: 0x0,
            type: "list",
            constraint: "min 0",
            children: [{ tag: "field", name: "entry", type: "LabelStruct" }],
        },
    ],
});
