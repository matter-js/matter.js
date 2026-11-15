/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "ThreadBorderRouterManagement",

    children: [
        {
            tag: "command",
            id: 0x2,
            name: "DatasetResponse",
            children: [{ tag: "field", id: 0x0, name: "Dataset", isSecret: true }],
        },
        {
            tag: "command",
            id: 0x3,
            name: "SetActiveDatasetRequest",
            children: [{ tag: "field", id: 0x0, name: "ActiveDataset", isSecret: true }],
        },
        {
            tag: "command",
            id: 0x4,
            name: "SetPendingDatasetRequest",
            children: [{ tag: "field", id: 0x0, name: "PendingDataset", isSecret: true }],
        },
    ],
});
