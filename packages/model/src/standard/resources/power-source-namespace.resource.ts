/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "PowerSource", xref: "namespace§15",
    details: "The tags contained in this namespace are restricted for use in the power source domain and shall NOT " +
        "be used in any other domain or context.",

    children: [
        {
            tag: "semanticTag", name: "Unknown",
            description: "The Power Source cluster is related to power provided from an unknown source"
        },

        {
            tag: "semanticTag", name: "Grid",
            description: "The Power Source cluster is related to power provided from the electrical grid",
            xref: "namespace§15.1",
            details: "Power Source clusters with this tag shall implement the WIRED feature."
        },

        {
            tag: "semanticTag", name: "Solar",
            description: "The Power Source cluster is related to power provided from a solar panel array",
            xref: "namespace§15.2",
            details: "Power Source clusters with this tag shall implement the WIRED feature."
        },

        {
            tag: "semanticTag", name: "Battery",
            description: "The Power Source cluster is related to power provided from a battery",
            xref: "namespace§15.3",
            details: "Power Source clusters with this tag shall implement the BAT feature."
        },

        {
            tag: "semanticTag", name: "Ev",
            description: "The Power Source cluster is related to power provided from an electric vehicle",
            xref: "namespace§15.4",
            details: "Power Source clusters with this tag shall implement the BAT feature."
        }
    ]
});
