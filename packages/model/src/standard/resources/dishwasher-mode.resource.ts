/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "DishwasherMode", pics: "DISHM", xref: "cluster§8.3",
    details: "This cluster is derived from the Mode Base cluster and defines additional mode tags and namespaced " +
        "enumerated values for dishwasher devices.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§8.3.4",
            children: [{ tag: "field", name: "DEPONOFF", details: "Dependency with the OnOff cluster" }]
        },
        {
            tag: "attribute", name: "SupportedModes", xref: "cluster§8.3.6.1",
            details: "At least one entry in the SupportedModes attribute shall include the Normal mode tag in the ModeTags " +
                "field list."
        },
        { tag: "attribute", name: "CurrentMode", xref: "cluster§8.3.6" },
        { tag: "attribute", name: "StartUpMode", xref: "cluster§8.3.6" },
        { tag: "attribute", name: "OnMode", xref: "cluster§8.3.6" },
        {
            tag: "datatype", name: "ModeOptionStruct", xref: "cluster§8.3.5.1",
            details: "The table below lists the changes relative to the Mode Base cluster for the fields of the " +
                "ModeOptionStruct type. A blank field indicates no change."
        },

        {
            tag: "datatype", name: "ModeTag",

            children: [
                { tag: "field", name: "Auto", xref: "cluster§8.3.7.1" },
                { tag: "field", name: "Quick", xref: "cluster§8.3.7.1" },
                { tag: "field", name: "Quiet", xref: "cluster§8.3.7.1" },
                { tag: "field", name: "LowNoise", xref: "cluster§8.3.7.1" },
                { tag: "field", name: "LowEnergy", xref: "cluster§8.3.7.1" },
                { tag: "field", name: "Vacation", xref: "cluster§8.3.7.1" },
                { tag: "field", name: "Min", xref: "cluster§8.3.7.1" },
                { tag: "field", name: "Max", xref: "cluster§8.3.7.1" },
                { tag: "field", name: "Night", xref: "cluster§8.3.7.1" },
                { tag: "field", name: "Day", xref: "cluster§8.3.7.1" },
                { tag: "field", name: "Normal", xref: "cluster§8.3.7.1.1", details: "The normal regime of operation." },
                {
                    tag: "field", name: "Heavy", xref: "cluster§8.3.7.1.2",
                    details: "Mode optimized for washing heavily-soiled dishes."
                },
                {
                    tag: "field", name: "Light", xref: "cluster§8.3.7.1.3",
                    details: "Mode optimized for light washing."
                }
            ]
        }
    ]
});
