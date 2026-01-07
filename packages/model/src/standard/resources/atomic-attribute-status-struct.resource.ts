/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "AtomicAttributeStatusStruct", xref: "core§7.15.5",
    details: "This struct indicates the status of an attribute during an atomic write.",

    children: [
        {
            tag: "field", name: "AttributeId", xref: "core§7.15.5.1",
            details: "This field shall indicate the ID of the attribute with the associated StatusCode."
        },
        {
            tag: "field", name: "StatusCode", xref: "core§7.15.5.2",
            details: "This field shall indicate the atomic status of an attribute."
        }
    ]
});
