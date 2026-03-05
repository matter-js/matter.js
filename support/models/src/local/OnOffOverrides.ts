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
        // Bump to revision 7
        { tag: "attribute", id: 0xfffd, name: "ClusterRevision", default: 7 },
    ],
});
