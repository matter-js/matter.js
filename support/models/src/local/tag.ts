/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { LocalMatter } from "../local.js";

// Tag is a Namespace specific Enum ID, so lets handle as normal uint8 number for now
LocalMatter.children.push({
    tag: "datatype",
    name: "tag",
    type: "uint8",
});
