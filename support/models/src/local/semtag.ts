/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { LocalMatter } from "../local.js";

// Namespace is a standard or device specific Enum ID
LocalMatter.children.push({
    tag: "datatype",
    name: "semtag",
    type: "struct",
    children: [
        {
            tag: "field",
            name: "Label",
            id: 0x3,
            conformance: "O", //TODO we do not support "MfgCode != null" for now
        },
    ],
});
