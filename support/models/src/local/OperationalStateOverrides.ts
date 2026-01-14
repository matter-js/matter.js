/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "OperationalState",
    asOf: "1.2",

    children: [
        // Spec incorrectly identifies as bare enum8 but references the actual enum definition in prose
        {
            id: 1,
            tag: "event",
            name: "OperationCompletion",
            asOf: "1.2",
            children: [{ tag: "field", name: "CompletionErrorCode", type: "ErrorState" }],
        },
    ],
});
