/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "RelativePosition", xref: "namespace§11",
    details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
        "association with a position relative to some reference, which must be specified by the user of these " +
        "tags. For example, the position may be relative to a household item, such as a dining table, and the " +
        "user of these tags must indicate that. Note the difference with Chapter 9, Common Position Semantic " +
        "Tag Namespace, which contains tags indicating the position relative to the device.",
    children: [
        { tag: "semanticTag", name: "NextTo", description: "Area in proximity to the point of reference" },
        { tag: "semanticTag", name: "Around", description: "The area surrounding the point the reference" }
    ]
});
