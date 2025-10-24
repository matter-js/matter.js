/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "Location", xref: "namespace§7",
    details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
        "association with a location of a device (e.g. an outdoor temperature sensor).",

    children: [
        {
            tag: "semanticTag", name: "Indoor",
            description: "Element is indoors or related to indoor equipment/conditions (e.g. the \"indoor\" temperature)."
        },
        {
            tag: "semanticTag", name: "Outdoor",
            description: "Element is outdoors or related to outdoor equipment/conditions (e.g. the \"outdoor\" temperature)."
        },
        {
            tag: "semanticTag", name: "Inside",
            description: "Element is located inside the equipment (e.g. a sensor \"inside\" a cabinet)."
        },
        {
            tag: "semanticTag", name: "Outside",
            description: "Element is located outside the equipment (e.g. a sensor \"outside\" a cabinet)."
        },
        {
            tag: "semanticTag", name: "Zone",
            description: "Element is a part of a location divided into zones (e.g. a yard irrigation zone)."
        }
    ]
});
