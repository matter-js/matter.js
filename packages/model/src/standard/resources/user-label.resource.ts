/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "UserLabel", pics: "ULABEL", xref: "core§9.9",
    details: "This cluster is derived from the Label cluster and provides a feature to tag an endpoint with zero " +
        "or more writable labels.",

    children: [{
        tag: "attribute", name: "LabelList", xref: "core§9.9.4.1",

        details: "The server shall support the storage of up to 4 list entries in this attribute. The server may " +
            "support the storage of more than 4 entries in this attribute." +
            "\n" +
            "When reading from this attribute, the server shall respond with the actual contents of the attribute " +
            "which may contain any number of entries (possibly more than 4), When writing to this attribute, a " +
            "client may include any number of entries to be written, or none at all." +
            "\n" +
            "If an attempt is made to write to this attribute with a list length that is not supported by the " +
            "server, the server shall respond with RESOURCE_EXHAUSTED."
    }]
});
