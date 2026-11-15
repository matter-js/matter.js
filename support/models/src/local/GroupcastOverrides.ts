/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "Groupcast",

    children: [
        {
            tag: "command",
            id: 0x0,
            name: "JoinGroup",
            children: [{ tag: "field", id: 0x3, name: "Key", isSecret: true }],
        },
        {
            tag: "command",
            id: 0x3,
            name: "UpdateGroupKey",
            children: [{ tag: "field", id: 0x2, name: "Key", isSecret: true }],
        },
    ],
});
