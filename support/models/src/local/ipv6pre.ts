/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { LocalMatter } from "../local.js";

// Add length constraint to the datatype because the spec table misses this
LocalMatter.children.push({
    tag: "datatype",
    name: "ipv6pre",
    constraint: "1 to 17",
});
