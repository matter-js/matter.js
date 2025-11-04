/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "EnergyEvseMode", pics: "EEVSEM", xref: "cluster§9.4",
    details: "This cluster is derived from the Mode Base cluster and defines additional mode tags and namespaced " +
        "enumerated values for EVSE devices.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§9.4.4",
            children: [{ tag: "field", name: "DEPONOFF", details: "Dependency with the OnOff cluster" }]
        },

        {
            tag: "attribute", name: "SupportedModes", xref: "cluster§9.4.6.1",

            details: "At least one entry in the SupportedModes attribute shall include the Manual mode tag in the ModeTags " +
                "field list." +
                "\n" +
                "Modes with entries in the SupportedModes attribute which contain multiple mode tags permitting " +
                "charging or discharging under different conditions shall permit the charging or discharging to occur " +
                "if any of the conditions are satisfied." +
                "\n" +
                "Modes shall NOT have both the Manual tag and the TimeOfUse or SolarCharging tags defined in the " +
                "SupportedModes attribute."
        },

        { tag: "attribute", name: "CurrentMode", xref: "cluster§9.4.6" },
        { tag: "attribute", name: "StartUpMode", xref: "cluster§9.4.6" },
        { tag: "attribute", name: "OnMode", xref: "cluster§9.4.6" },
        {
            tag: "datatype", name: "ModeOptionStruct", xref: "cluster§9.4.5.1",
            details: "The table below lists the changes relative to the Mode Base cluster for the fields of the " +
                "ModeOptionStruct type. A blank field indicates no change."
        },

        {
            tag: "datatype", name: "ModeTag",

            children: [
                { tag: "field", name: "Auto", xref: "cluster§9.4.7.1" },
                { tag: "field", name: "Quick", xref: "cluster§9.4.7.1" },
                { tag: "field", name: "Quiet", xref: "cluster§9.4.7.1" },
                { tag: "field", name: "LowNoise", xref: "cluster§9.4.7.1" },
                { tag: "field", name: "LowEnergy", xref: "cluster§9.4.7.1" },
                { tag: "field", name: "Vacation", xref: "cluster§9.4.7.1" },
                { tag: "field", name: "Min", xref: "cluster§9.4.7.1" },
                { tag: "field", name: "Max", xref: "cluster§9.4.7.1" },
                { tag: "field", name: "Night", xref: "cluster§9.4.7.1" },
                { tag: "field", name: "Day", xref: "cluster§9.4.7.1" },
                {
                    tag: "field", name: "Manual", xref: "cluster§9.4.7.1.1",
                    details: "While in modes with this tag, and once enabled with the EnableCharging command, the EVSE will permit " +
                        "charging based on demand from the EV."
                },

                {
                    tag: "field", name: "TimeOfUse", xref: "cluster§9.4.7.1.2",
                    details: "While in modes with this tag, and once enabled with the EnableCharging command, the EVSE will " +
                        "attempt to automatically start charging based on the user’s charging targets (for example, set based " +
                        "on a Time of Use tariff to charge at the cheapest times of the day)."
                },

                {
                    tag: "field", name: "SolarCharging", xref: "cluster§9.4.7.1.3",
                    details: "While in modes with this tag, and once enabled with the EnableCharging, the EVSE will attempt to " +
                        "automatically start charging based on available excess solar PV generation, limiting the charging " +
                        "power to avoid importing energy from the grid."
                },

                {
                    tag: "field", name: "V2X", xref: "cluster§9.4.7.1.4",

                    details: "While in modes with this tag, and once enabled with the EnableDischarging command, the EVSE will " +
                        "permit discharging based on the current charge state of the EV, and its control from an associated " +
                        "Device Energy Management cluster." +
                        "\n" +
                        "> [!NOTE]" +
                        "\n" +
                        "> being in a mode with this tag set or not does not affect the handling of the EnableDischarging " +
                        "  command by the Energy EVSE cluster, but once enabled, only modes with this tag enable the " +
                        "  discharging to actually occur."
                }
            ]
        }
    ]
});
