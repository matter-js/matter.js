/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "epoch-s", description: "Epoch Time in seconds", xref: "core§7.19.2.4",

    details: "This type represents an offset, in seconds, from 0 hours, 0 minutes, 0 seconds, on the 1st of " +
        "January, 2000 UTC (the Epoch), encoded as an unsigned 32-bit scalar value. Other than that, this " +
        "type has the same semantics as Epoch Time in Microseconds." +
        "\n" +
        "This type is employed where compactness of representation is important and where the resolution of " +
        "seconds is still satisfactory."
});
