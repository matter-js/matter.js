/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "AtomicRequestTypeEnum", xref: "core§7.15.4",

    children: [
        { tag: "field", name: "BeginWrite", description: "Begin an atomic write" },
        { tag: "field", name: "CommitWrite", description: "Commit an atomic write" },
        {
            tag: "field", name: "RollbackWrite",
            description: "Rollback an atomic write, discarding any pending changes"
        }
    ]
});
