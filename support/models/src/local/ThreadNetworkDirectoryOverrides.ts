/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "ThreadNetworkDirectory",

    children: [
        {
            tag: "command",
            id: 0x0,
            name: "AddNetwork",
            children: [{ tag: "field", id: 0x0, name: "OperationalDataset", isSecret: true }],
        },
        {
            tag: "command",
            id: 0x3,
            name: "OperationalDatasetResponse",
            children: [{ tag: "field", id: 0x0, name: "OperationalDataset", isSecret: true }],
        },
    ],
});
