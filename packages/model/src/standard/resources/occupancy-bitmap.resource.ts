/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "OccupancyBitmap", xref: "cluster§2.7.5.1",

    children: [{
        tag: "field", name: "Occupied", description: "Indicates the sensed occupancy state",
        xref: "cluster§2.7.5.1.1",
        details: "If this bit is set, it shall indicate the occupied state else if the bit if not set, it shall " +
            "indicate the unoccupied state."
    }]
});
