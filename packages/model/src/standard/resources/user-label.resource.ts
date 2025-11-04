/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
        details: "An implementation shall support at least 4 list entries per node for all User Label cluster " +
            "instances on the node."
    }]
});
