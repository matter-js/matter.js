/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "RefrigeratorAndTemperatureControlledCabinetMode", pics: "TCCM",
    xref: "cluster§8.7",
    details: "This cluster is derived from the Mode Base cluster and defines additional mode tags and namespaced " +
        "enumerated values for refrigerator and temperature controlled cabinet devices.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§8.7.4",
            children: [{ tag: "field", name: "DEPONOFF", details: "Dependency with the OnOff cluster" }]
        },
        {
            tag: "attribute", name: "SupportedModes", xref: "cluster§8.7.6.1",
            details: "At least one entry in the SupportedModes attribute shall include the Auto mode tag in the ModeTags " +
                "field list."
        },
        { tag: "attribute", name: "CurrentMode", xref: "cluster§8.7.6" },
        { tag: "attribute", name: "StartUpMode", xref: "cluster§8.7.6" },
        { tag: "attribute", name: "OnMode", xref: "cluster§8.7.6" },
        {
            tag: "datatype", name: "ModeOptionStruct", xref: "cluster§8.7.5.1",
            details: "The table below lists the changes relative to the Mode Base cluster for the fields of the " +
                "ModeOptionStruct type. A blank field indicates no change."
        },

        {
            tag: "datatype", name: "ModeTag",

            children: [
                { tag: "field", name: "Auto", xref: "cluster§8.7.7.1" },
                { tag: "field", name: "Quick", xref: "cluster§8.7.7.1" },
                { tag: "field", name: "Quiet", xref: "cluster§8.7.7.1" },
                { tag: "field", name: "LowNoise", xref: "cluster§8.7.7.1" },
                { tag: "field", name: "LowEnergy", xref: "cluster§8.7.7.1" },
                { tag: "field", name: "Vacation", xref: "cluster§8.7.7.1" },
                { tag: "field", name: "Min", xref: "cluster§8.7.7.1" },
                { tag: "field", name: "Max", xref: "cluster§8.7.7.1" },
                { tag: "field", name: "Night", xref: "cluster§8.7.7.1" },
                { tag: "field", name: "Day", xref: "cluster§8.7.7.1" },
                {
                    tag: "field", name: "RapidCool", xref: "cluster§8.7.7.1.1",
                    details: "This mode reduces the temperature rapidly, typically above freezing grade."
                },
                {
                    tag: "field", name: "RapidFreeze", xref: "cluster§8.7.7.1.2",
                    details: "This mode reduces the temperature rapidly, below freezing grade."
                }
            ]
        }
    ]
});
