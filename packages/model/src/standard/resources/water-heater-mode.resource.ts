/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "WaterHeaterMode", pics: "WHM", xref: "cluster§9.6",
    details: "This cluster is derived from the Mode Base cluster and defines additional mode tags and namespaced " +
        "enumerated values for water heater devices.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§9.6.4",
            children: [{ tag: "field", name: "DEPONOFF", details: "Dependency with the OnOff cluster" }]
        },

        {
            tag: "attribute", name: "SupportedModes", xref: "cluster§9.6.6.1",

            details: "At least one entry in the SupportedModes attribute shall include the Manual mode tag in the ModeTags " +
                "field list." +
                "\n" +
                "At least one entry in the SupportedModes attribute shall include the Off mode tag in the ModeTags " +
                "field list." +
                "\n" +
                "An entry in the SupportedModes attribute that includes one of an Off, Manual, or Timed tag shall NOT " +
                "also include an additional instance of any one of these tag types."
        },

        { tag: "attribute", name: "CurrentMode", xref: "cluster§9.6.6" },
        { tag: "attribute", name: "StartUpMode", xref: "cluster§9.6.6" },
        { tag: "attribute", name: "OnMode", xref: "cluster§9.6.6" },
        {
            tag: "datatype", name: "ModeOptionStruct", xref: "cluster§9.6.5.1",
            details: "The table below lists the changes relative to the Mode Base cluster for the fields of the " +
                "ModeOptionStruct type. A blank field indicates no change."
        },

        {
            tag: "datatype", name: "ModeTag",

            children: [
                { tag: "field", name: "Auto", xref: "cluster§9.6.7.1" },
                { tag: "field", name: "Quick", xref: "cluster§9.6.7.1" },
                { tag: "field", name: "Quiet", xref: "cluster§9.6.7.1" },
                { tag: "field", name: "LowNoise", xref: "cluster§9.6.7.1" },
                { tag: "field", name: "LowEnergy", xref: "cluster§9.6.7.1" },
                { tag: "field", name: "Vacation", xref: "cluster§9.6.7.1" },
                { tag: "field", name: "Min", xref: "cluster§9.6.7.1" },
                { tag: "field", name: "Max", xref: "cluster§9.6.7.1" },
                { tag: "field", name: "Night", xref: "cluster§9.6.7.1" },
                { tag: "field", name: "Day", xref: "cluster§9.6.7.1" },
                {
                    tag: "field", name: "Off", xref: "cluster§9.6.7.1.1",
                    details: "While in modes with this tag, the device will not attempt to keep the water warm."
                },
                {
                    tag: "field", name: "Manual", xref: "cluster§9.6.7.1.2",
                    details: "While in modes with this tag, the device will attempt to keep the water warm based on the " +
                        "OccupiedHeatingSetpoint attribute of the associated Thermostat cluster."
                },
                {
                    tag: "field", name: "Timed", xref: "cluster§9.6.7.1.3",
                    details: "While in modes with this tag, the device will attempt to keep the water warm based on the Schedules " +
                        "attribute of the associated Thermostat cluster."
                }
            ]
        }
    ]
});
