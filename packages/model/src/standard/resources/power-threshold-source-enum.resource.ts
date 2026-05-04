/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "PowerThresholdSourceEnum", xref: "cluster§9.1.4",

    children: [
        { tag: "field", name: "Contract", description: "The power threshold comes from a signed contract" },
        { tag: "field", name: "Regulator", description: "The power threshold comes from a legal regulator" },
        {
            tag: "field", name: "Equipment",
            description: "The power threshold comes from a certified limits of the meter"
        }
    ]
});
