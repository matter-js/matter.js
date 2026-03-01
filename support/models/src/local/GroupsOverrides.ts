/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureMap } from "@matter/model";
import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "Groups",

    children: [
        // Bump to revision 5: group management commands are deprecated when Groupcast cluster is used
        { tag: "attribute", id: 0xfffd, name: "ClusterRevision", default: 5 },

        // Enable group names by default.  Not mandated by the specification but a reasonable default
        {
            tag: "attribute",
            id: FeatureMap.id,
            name: FeatureMap.name,
            children: [{ tag: "field", name: "GN", default: true }],
        },

        // Set NameSupport default to match feature default per the specification
        {
            tag: "attribute",
            id: 0,
            name: "NameSupport",
            children: [{ tag: "field", name: "GroupNames", default: true, constraint: "7" }],
        },
    ],
});
