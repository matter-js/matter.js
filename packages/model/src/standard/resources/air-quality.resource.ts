/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "AirQuality", pics: "AIRQUAL", xref: "cluster§2.9",
    details: "This cluster provides an interface to air quality classification using distinct levels with " +
        "human-readable labels.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§2.9.4",

            children: [
                { tag: "field", name: "FAIR", details: "Cluster supports the Fair air quality level" },
                { tag: "field", name: "MOD", details: "Cluster supports the Moderate air quality level" },
                { tag: "field", name: "VPOOR", details: "Cluster supports the Very poor air quality level" },
                { tag: "field", name: "XPOOR", details: "Cluster supports the Extremely poor air quality level" }
            ]
        },

        {
            tag: "attribute", name: "AirQuality", xref: "cluster§2.9.6.1",
            details: "Indicates a value from AirQualityEnum that is indicative of the currently measured air quality."
        },

        {
            tag: "datatype", name: "AirQualityEnum", xref: "cluster§2.9.5.1",
            details: "The AirQualityEnum provides a representation of the quality of the analyzed air. It is up to the " +
                "device manufacturer to determine the mapping between the measured values and their corresponding " +
                "enumeration values.",

            children: [
                { tag: "field", name: "Unknown", description: "The air quality is unknown." },
                { tag: "field", name: "Good", description: "The air quality is good." },
                { tag: "field", name: "Fair", description: "The air quality is fair." },
                { tag: "field", name: "Moderate", description: "The air quality is moderate." },
                { tag: "field", name: "Poor", description: "The air quality is poor." },
                { tag: "field", name: "VeryPoor", description: "The air quality is very poor." },
                { tag: "field", name: "ExtremelyPoor", description: "The air quality is extremely poor." }
            ]
        }
    ]
});
