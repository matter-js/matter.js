/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "MicrowaveOvenMode", pics: "MWOM", xref: "cluster§8.12",
    details: "This cluster is derived from the Mode Base cluster and defines additional mode tags and namespaced " +
        "enumerated values for microwave oven devices.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§8.12.4",
            children: [{ tag: "field", name: "DEPONOFF", details: "Dependency with the OnOff cluster" }]
        },

        {
            tag: "attribute", name: "SupportedModes", xref: "cluster§8.12.5.1",
            details: "Exactly one entry in the SupportedModes attribute shall include the Normal mode tag in the ModeTags " +
                "field." +
                "\n" +
                "The Normal and Defrost mode tags are mutually exclusive and shall NOT both be used together in a " +
                "mode’s ModeTags."
        },

        { tag: "attribute", name: "CurrentMode", xref: "cluster§8.12.5" },
        { tag: "attribute", name: "StartUpMode", xref: "cluster§8.12.5" },
        { tag: "attribute", name: "OnMode", xref: "cluster§8.12.5" },
        { tag: "command", name: "ChangeToMode", xref: "cluster§8.12.6" },
        { tag: "command", name: "ChangeToModeResponse", xref: "cluster§8.12.6" },

        {
            tag: "datatype", name: "ModeTag",

            children: [
                { tag: "field", name: "Auto", xref: "cluster§8.12.7.1" },
                { tag: "field", name: "Quick", xref: "cluster§8.12.7.1" },
                { tag: "field", name: "Quiet", xref: "cluster§8.12.7.1" },
                { tag: "field", name: "LowNoise", xref: "cluster§8.12.7.1" },
                { tag: "field", name: "LowEnergy", xref: "cluster§8.12.7.1" },
                { tag: "field", name: "Vacation", xref: "cluster§8.12.7.1" },
                { tag: "field", name: "Min", xref: "cluster§8.12.7.1" },
                { tag: "field", name: "Max", xref: "cluster§8.12.7.1" },
                { tag: "field", name: "Night", xref: "cluster§8.12.7.1" },
                { tag: "field", name: "Day", xref: "cluster§8.12.7.1" },
                {
                    tag: "field", name: "Normal", xref: "cluster§8.12.7.1.1",
                    details: "This is the normal mode of operation for general cooking of food."
                },
                {
                    tag: "field", name: "Defrost", xref: "cluster§8.12.7.1.2",
                    details: "This is a mode optimized for defrosting food."
                }
            ]
        }
    ]
});
