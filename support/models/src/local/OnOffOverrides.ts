/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "OnOff",

    children: [
        // SVE: revision 7 (Matter 1.6.1 draft)
        { tag: "attribute", id: 0xfffd, name: "ClusterRevision", default: 7 },
    ],
});
