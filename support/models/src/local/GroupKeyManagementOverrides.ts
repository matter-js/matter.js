/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "GroupKeyManagement",

    children: [
        // Conformance of this field in the struct is "provisional, mandatory" which in fact means "optional"
        // TODO: We should do this already in the conformance interpreter
        // Default: GroupKeyMulticastPolicyEnum.PerGroupID
        {
            tag: "datatype",
            name: "GroupKeySetStruct",
            type: "struct",
            children: [{ tag: "field", id: 0x8, name: "GroupKeyMulticastPolicy", conformance: "O", default: 0 }],
        },
        {
            tag: "command",
            id: 0x4,
            name: "KeySetReadAllIndices",
            until: "1.1",

            children: [
                // The presence of this field is a CHIP bug in 1.1 branch.
                // They fixed in their main branch...  Remove via conformance
                { tag: "field", id: 0x0, name: "GroupKeySetIDs", conformance: "X" },
            ],
        },
    ],
});
