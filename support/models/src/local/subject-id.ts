/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

// Older specifications reference this type without defining it
LocalMatter.children.push({
    tag: "datatype",
    name: "subject-id",
    type: "uint64",
    description: "A subject granted privileges to interact with a node.",
});
