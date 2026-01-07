/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "TimeSynchronization",

    children: [
        {
            tag: "attribute",
            id: 5,
            name: "TimeZone",

            // Specs through 1.3 make up an informal syntax to express this default
            default: [{ type: "properties", properties: { offset: 0, validAt: 0 } }],
        },
    ],
});
