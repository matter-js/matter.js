/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { LocalMatter } from "../local.js";

// Namespace is a standard or device-specific Enum ID, children will be added in finalize-model.ts step
LocalMatter.children.push({
    tag: "datatype",
    name: "namespace",
    type: "enum8",
    children: [],
});
