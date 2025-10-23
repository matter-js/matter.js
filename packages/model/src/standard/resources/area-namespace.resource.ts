/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "AreaNamespace", xref: "namespace§13",
    details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
        "association with an indoor or outdoor area of a home.",

    children: [
        { tag: "semanticTag", name: "Bathroom", description: "Also known as Restroom" },
        { tag: "semanticTag", name: "Boxroom", description: "A small room typically used for storage" },
        {
            tag: "semanticTag", name: "Closet",
            description: "A small room for storing clothing, linens, and other items."
        },
        {
            tag: "semanticTag", name: "Den",
            description: "A small, comfortable room for individual activities such as work or hobbies"
        },
        { tag: "semanticTag", name: "Ensuite", description: "A bathroom directly accessible from a bedroom" },
        { tag: "semanticTag", name: "GuestBathroom", description: "Also known as Guest Restroom" },
        {
            tag: "semanticTag", name: "Reserved1",
            description: "Deprecated: was Guest Restroom; use 0x26 Guest Bathroom"
        },
        { tag: "semanticTag", name: "GuestRoom", description: "Also known as Guest Bedroom" },
        {
            tag: "semanticTag", name: "HearthRoom",
            description: "A cozy room containing a fireplace or other point heat source"
        },
        { tag: "semanticTag", name: "Reserved2", description: "Deprecated: was Larder; use 0x3D Pantry" },
        {
            tag: "semanticTag", name: "MudRoom",
            description: "A space used to remove soiled garments prior to entering the domicile proper"
        },
        { tag: "semanticTag", name: "Pantry", description: "AKA a larder, a place where food is stored" },
        { tag: "semanticTag", name: "PoolRoom", description: "A room centered around a pool/billiards table" },
        { tag: "semanticTag", name: "Reserved3", description: "Deprecated: was Restroom; use 0x06 Bathroom" },
        { tag: "semanticTag", name: "Scullery", description: "A utility space for cleaning dishes and laundry" },
        {
            tag: "semanticTag", name: "Snug",
            description: "An informal space meant to be 'cozy', 'snug', relaxed, meant to share with family or friends"
        },
        { tag: "semanticTag", name: "Ward", description: "The innermost area of a large home" },
        { tag: "semanticTag", name: "Toilet", description: "A room dedicated to a toilet; a water closet / WC" }
    ]
});
