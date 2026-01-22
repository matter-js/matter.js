/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { LocalMatter } from "../local.js";

// Add length constraint to the datatype because the spec table misses this
LocalMatter.children.push({
    tag: "datatype",
    name: "hwadr",
    constraint: "6 to 8", // Formally 6 OR 8, but we do not support this, so min/max is the best we can do
});
