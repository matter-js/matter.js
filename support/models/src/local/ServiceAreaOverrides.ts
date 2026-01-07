/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "ServiceArea",
    asOf: "1.4",

    children: [
        // Field name for ProgressStruct need to be adjusted to how SDK shipped. Will be fixed also by Matter 1.5 likely
        // InitialTimeEstimate -> EstimatedTime
        {
            tag: "datatype",
            name: "ProgressStruct",
            children: [{ tag: "field", id: 0x3, name: "EstimatedTime" }],
        },
    ],
});
