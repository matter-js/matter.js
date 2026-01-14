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
                {
                    tag: "field",
                    name: "Medium",
                    conformance: "O",
                    id: 0x2,
                },
            ],
        },
    ],
});
