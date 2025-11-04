/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "RvcRunMode", pics: "RVCRUNM", xref: "cluster§7.2",
    details: "This cluster is derived from the Mode Base cluster and defines additional mode tags and namespaced " +
        "enumerated values for the running modes of robotic vacuum cleaner devices.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§7.2.4",
            children: [{ tag: "field", name: "DEPONOFF", details: "Dependency with the OnOff cluster" }]
        },

        {
            tag: "attribute", name: "SupportedModes", xref: "cluster§7.2.6.1",

            details: "At least one entry in the SupportedModes attribute shall include the Idle mode tag in the ModeTags " +
                "field." +
                "\n" +
                "At least one entry in the SupportedModes attribute (different from the one above) shall include the " +
                "Cleaning mode tag in the ModeTags field." +
                "\n" +
                "The Mapping, Cleaning, and Idle mode tags are mutually exclusive and shall NOT be used together in a " +
                "mode’s ModeTags."
        },

        { tag: "attribute", name: "CurrentMode", xref: "cluster§7.2.6" },
        { tag: "attribute", name: "StartUpMode", xref: "cluster§7.2.6" },
        { tag: "attribute", name: "OnMode", xref: "cluster§7.2.6" },
        {
            tag: "datatype", name: "ModeOptionStruct", xref: "cluster§7.2.5.1",
            details: "The table below lists the changes relative to the Mode Base cluster for the fields of the " +
                "ModeOptionStruct type. A blank field indicates no change."
        },

        {
            tag: "datatype", name: "ModeChangeStatus",

            children: [
                { tag: "field", name: "Stuck", xref: "cluster§7.2.7.1" },
                { tag: "field", name: "DustBinMissing", xref: "cluster§7.2.7.1" },
                { tag: "field", name: "DustBinFull", xref: "cluster§7.2.7.1" },
                { tag: "field", name: "WaterTankEmpty", xref: "cluster§7.2.7.1" },
                { tag: "field", name: "WaterTankMissing", xref: "cluster§7.2.7.1" },
                { tag: "field", name: "WaterTankLidOpen", xref: "cluster§7.2.7.1" },
                { tag: "field", name: "MopCleaningPadMissing", xref: "cluster§7.2.7.1" },
                { tag: "field", name: "BatteryLow", xref: "cluster§7.2.7.1" }
            ]
        },

        {
            tag: "datatype", name: "ModeTag",

            children: [
                { tag: "field", name: "Auto", xref: "cluster§7.2.7.2" },
                { tag: "field", name: "Quick", xref: "cluster§7.2.7.2" },
                { tag: "field", name: "Quiet", xref: "cluster§7.2.7.2" },
                { tag: "field", name: "LowNoise", xref: "cluster§7.2.7.2" },
                { tag: "field", name: "LowEnergy", xref: "cluster§7.2.7.2" },
                { tag: "field", name: "Vacation", xref: "cluster§7.2.7.2" },
                { tag: "field", name: "Min", xref: "cluster§7.2.7.2" },
                { tag: "field", name: "Max", xref: "cluster§7.2.7.2" },
                { tag: "field", name: "Night", xref: "cluster§7.2.7.2" },
                { tag: "field", name: "Day", xref: "cluster§7.2.7.2" },

                {
                    tag: "field", name: "Idle", xref: "cluster§7.2.7.2.1",
                    details: "The device is not performing any of the main operations of the other modes. However, auxiliary " +
                        "actions, such as seeking the charger or charging, may occur." +
                        "\n" +
                        "For example, the device has completed cleaning, successfully or not, on its own or due to a command, " +
                        "or has not been asked to clean after a restart."
                },

                {
                    tag: "field", name: "Cleaning", xref: "cluster§7.2.7.2.2",
                    details: "The device was asked to clean so it may be actively running, or paused due to an error, due to a " +
                        "pause command, or for recharging etc. If currently paused and the device can resume it will continue " +
                        "to clean."
                },

                {
                    tag: "field", name: "Mapping", xref: "cluster§7.2.7.2.3",

                    details: "The device was asked to create a map of the space it is located in, so it may be actively running, " +
                        "or paused due to an error, due to a pause command, or for recharging etc. If currently paused and " +
                        "the device can resume, it will continue to map." +
                        "\n" +
                        "> [!NOTE]" +
                        "\n" +
                        "> this mode is intended to be used so the current space can be mapped by the device if the robot has " +
                        "  not previously done that, or if the layout has substantially changed, for an optimal subsequent " +
                        "  cleaning experience."
                }
            ]
        }
    ]
});
