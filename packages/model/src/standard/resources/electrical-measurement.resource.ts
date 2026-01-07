/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "ElectricalMeasurement", xref: "namespace§12",
    details: "The tags contained in this namespace are restricted for use in the electrical measurement domain and " +
        "shall NOT be used in any other domain or context.",

    children: [
        { tag: "semanticTag", name: "DC", description: "Indicates values measured for a DC load" },
        {
            tag: "semanticTag", name: "AC",
            description: "Indicates values measured for a single-phase AC load, or values measured for the collective load on a polyphase AC power supply"
        },
        {
            tag: "semanticTag", name: "ACPhase1",
            description: "Indicates values measured for an AC load on phase 1 of a polyphase power supply"
        },
        {
            tag: "semanticTag", name: "ACPhase2",
            description: "Indicates values measured for an AC load on phase 2 of a polyphase power supply"
        },
        {
            tag: "semanticTag", name: "ACPhase3",
            description: "Indicates values measured for an AC load on phase 3 of a polyphase power supply"
        }
    ]
});
