/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "ModeBase",

    children: [
        {
            tag: "datatype",
            name: "ModeTagStruct",

            children: [
                {
                    tag: "field",
                    id: 1,
                    name: "Value",
                    type: "ModeTag",
                },
            ],
        },

        {
            tag: "command",
            name: "ChangeToModeResponse",
            id: 0x01,
            children: [
                {
                    tag: "field",
                    id: 0,
                    name: "Status",
                    type: "ModeChangeStatus",
                },
            ],
        },
    ],
});
