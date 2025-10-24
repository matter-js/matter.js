/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "LandmarkNamespace", xref: "namespace§10",
    details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
        "association with a home landmark.",

    children: [
        { tag: "semanticTag", name: "PetCrate", description: "An indoor furnishing for pets to rest or sleep inside" },
        {
            tag: "semanticTag", name: "Shower",
            description: "An area where a showerhead dispenses water for people to shower"
        },
        {
            tag: "semanticTag", name: "WineCooler",
            description: "A type of refrigerator that is shelved to hold wine bottles and (typically) display them through a glass front"
        }
    ]
});
