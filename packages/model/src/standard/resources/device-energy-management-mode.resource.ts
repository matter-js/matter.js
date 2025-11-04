/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "DeviceEnergyManagementMode", pics: "DEMM", xref: "cluster§9.8",
    details: "This cluster is derived from the Mode Base cluster and defines additional mode tags and namespaced " +
        "enumerated values for Device Energy Management devices.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§9.8.4",
            children: [{ tag: "field", name: "DEPONOFF", details: "Dependency with the OnOff cluster" }]
        },

        {
            tag: "attribute", name: "SupportedModes", xref: "cluster§9.8.6.1",

            details: "At least one entry in the SupportedModes attribute shall include the NoOptimization mode tag in the " +
                "ModeTags field." +
                "\n" +
                "At least one entry in the SupportedModes attribute shall include the LocalOptimization mode tag in " +
                "the ModeTags field list." +
                "\n" +
                "At least one entry in the SupportedModes attribute shall include the GridOptimization mode tag in " +
                "the ModeTags field list." +
                "\n" +
                "An entry in the SupportedModes attribute that includes one of an DeviceOptimization, " +
                "LocalOptimization, or GridOptimization tags shall NOT also include NoOptimization tag."
        },

        { tag: "attribute", name: "CurrentMode", xref: "cluster§9.8.6" },
        { tag: "attribute", name: "StartUpMode", xref: "cluster§9.8.6" },
        { tag: "attribute", name: "OnMode", xref: "cluster§9.8.6" },
        {
            tag: "datatype", name: "ModeOptionStruct", xref: "cluster§9.8.5.1",
            details: "The table below lists the changes relative to the Mode Base cluster for the fields of the " +
                "ModeOptionStruct type. A blank field indicates no change."
        },

        {
            tag: "datatype", name: "ModeTag",

            children: [
                { tag: "field", name: "Auto", xref: "cluster§9.8.7.1" },
                { tag: "field", name: "Quick", xref: "cluster§9.8.7.1" },
                { tag: "field", name: "Quiet", xref: "cluster§9.8.7.1" },
                { tag: "field", name: "LowNoise", xref: "cluster§9.8.7.1" },
                { tag: "field", name: "LowEnergy", xref: "cluster§9.8.7.1" },
                { tag: "field", name: "Vacation", xref: "cluster§9.8.7.1" },
                { tag: "field", name: "Min", xref: "cluster§9.8.7.1" },
                { tag: "field", name: "Max", xref: "cluster§9.8.7.1" },
                { tag: "field", name: "Night", xref: "cluster§9.8.7.1" },
                { tag: "field", name: "Day", xref: "cluster§9.8.7.1" },
                {
                    tag: "field", name: "NoOptimization", xref: "cluster§9.8.7.1.1",
                    details: "The device prohibits optimization of energy usage management: its energy usage is determined only by " +
                        "the user configuration and internal device needs."
                },
                {
                    tag: "field", name: "DeviceOptimization", xref: "cluster§9.8.7.1.2",
                    details: "The device is permitted to manage its own energy usage. For example, using tariff information it may " +
                        "obtain."
                },
                {
                    tag: "field", name: "LocalOptimization", xref: "cluster§9.8.7.1.3",
                    details: "The device permits management of energy usage by an energy manager to optimize the local energy " +
                        "usage."
                },
                {
                    tag: "field", name: "GridOptimization", xref: "cluster§9.8.7.1.4",
                    details: "The device permits management of energy usage by an energy manager to optimize the grid energy " +
                        "usage."
                }
            ]
        }
    ]
});
