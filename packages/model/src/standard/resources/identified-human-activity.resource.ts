/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "IdentifiedHumanActivity", xref: "namespace§29",
    details: "The tags contained in this namespace are intended to be used to identify human activity by some " +
        "detection or sensing implementation.",

    children: [
        { tag: "semanticTag", name: "Unknown", description: "Unknown human activity is detected." },
        { tag: "semanticTag", name: "Fall", description: "Human fall is detected." },
        { tag: "semanticTag", name: "Sleeping", description: "Human sleeping is detected." },
        { tag: "semanticTag", name: "Walking", description: "Human walking is detected." },
        { tag: "semanticTag", name: "Workout", description: "Human workout is detected." },
        { tag: "semanticTag", name: "Sitting", description: "Human sitting is detected." },
        { tag: "semanticTag", name: "Standing", description: "Human standing is detected." },
        { tag: "semanticTag", name: "Dancing", description: "Human dancing is detected." },
        { tag: "semanticTag", name: "PackageDelivery", description: "Human delivery of package is detected." },
        { tag: "semanticTag", name: "PackageRetrieval", description: "Human retrieval of package is detected." }
    ]
});
