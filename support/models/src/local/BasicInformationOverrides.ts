/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "BasicInformation",

    children: [
        {
            tag: "attribute",
            name: "ProductAppearance",
            id: 0x14,
            type: "ProductAppearanceStruct",
            conformance: "O",
            quality: "F",
            until: "1.3",
        },
    ],
});
