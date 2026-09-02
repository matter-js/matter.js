/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "JointFabricDatastore",

    children: [
        // The specification bounds these by SubjectsPerAccessControlEntry and TargetsPerAccessControlEntry, which are
        // attributes of the access control cluster.  A constraint reaches the fields of its own table, an element it
        // names, an attribute of its own cluster, or a constant, so nothing resolves an attribute of another cluster
        // and the bound admits every value.  They are stated as unbounded, which is what they are.
        {
            tag: "datatype",
            name: "DatastoreAccessControlEntryStruct",
            children: [
                { tag: "field", id: 0x3, name: "Subjects", constraint: "none" },
                { tag: "field", id: 0x4, name: "Targets", constraint: "none" },
            ],
        },
    ],
});
