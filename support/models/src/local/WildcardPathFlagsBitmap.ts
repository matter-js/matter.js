/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "datatype",
    type: "map16",
    name: "WildcardPathFlagsBitmap",

    children: [
        {
            tag: "field",
            name: "Reserved",
            constraint: "3",
            title: "Reserved",
            until: "1.3",
        },
    ],
});
