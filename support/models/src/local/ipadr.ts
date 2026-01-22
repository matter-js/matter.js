/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { LocalMatter } from "../local.js";

// Add length constraint to the datatype because the spec table misses this
LocalMatter.children.push({
    tag: "datatype",
    name: "ipadr",
    constraint: "4, 16", // Formally 4 OR 16, but we do not support this, so min/max is the best we can do
});
