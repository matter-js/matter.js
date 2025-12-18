/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "OtaSoftwareUpdateRequestor",

    children: [
        // Spec says: "Some care SHOULD be taken by Nodes to avoid over-reporting progress when this attribute is part
        // of a subscription.", so simply use Q for that.
        {
            id: 3,
            tag: "attribute",
            name: "UpdateStateProgress",
            quality: "X Q",
        },
    ],
});
