/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ElectricalGridConditions", pics: "EGC", xref: "cluster§9.13",

    details: "The Electrical Grid Conditions Cluster provides the mechanism for communicating electricity grid " +
        "carbon intensity to devices within the premises in units of Grams of CO2e per kWh." +
        "\n" +
        "This is an important mechanism to allow energy appliances decide when to operate to help consumers " +
        "reduce their carbon footprint, when the pricing may be the same throughout the day." +
        "\n" +
        "When homes have local generation (for example Solar PV) this may mean that the premises at the local " +
        "grid connection point has effectively no green house gas emissions, and so this cluster allows " +
        "devices to understand both the grid and local conditions.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§9.13.4",
            children: [{
                tag: "field", name: "FORE", xref: "cluster§9.13.4.1",
                details: "The feature indicates the server is capable of providing a forecast of grid and local conditions for " +
                    "several hours in the future."
            }]
        },

        {
            tag: "attribute", name: "LocalGenerationAvailable", xref: "cluster§9.13.6.1",
            details: "This shall indicate if there is known to be local generation (for example Solar PV or Battery " +
                "Storage) at the premises." +
                "\n" +
                "If the presence of any local generation is unknown, or cannot be determined, the value shall be " +
                "null."
        },

        {
            tag: "attribute", name: "CurrentConditions", xref: "cluster§9.13.6.2",
            details: "This shall indicate the current electricity supply conditions. If the current conditions are " +
                "unknown, or cannot be determined, the value shall be null."
        },

        {
            tag: "attribute", name: "ForecastConditions", xref: "cluster§9.13.6.3",

            details: "This shall indicate the forecast of upcoming electricity supply conditions. If the forecast is " +
                "unable to be determined, this list shall be empty." +
                "\n" +
                "The list entries shall be in time order:" +
                "\n" +
                "  - All entries except the last one shall have a non-null PeriodEnd." +
                "\n" +
                "  - For all entries except the first one, PeriodStart shall be greater than the previous entry's " +
                "PeriodEnd."
        },

        {
            tag: "event", name: "CurrentConditionsChanged", xref: "cluster§9.13.7.1",
            details: "This event shall be generated when the value of the CurrentConditions attribute changes.",
            children: [{
                tag: "field", name: "CurrentConditions", xref: "cluster§9.13.7.1.1",
                details: "This field shall be the new value of the CurrentConditions attribute."
            }]
        },

        {
            tag: "datatype", name: "ThreeLevelEnum", xref: "cluster§9.13.5.1",
            details: "This data type is derived from enum8 and is used for indicating three levels: Low, Medium, High.",
            children: [
                { tag: "field", name: "Low", description: "Low" },
                { tag: "field", name: "Medium", description: "Medium" },
                { tag: "field", name: "High", description: "High" }
            ]
        },

        {
            tag: "datatype", name: "ElectricalGridConditionsStruct", xref: "cluster§9.13.5.2",
            details: "This represents the greenhouse gas carbon intensity over a given period.",

            children: [
                {
                    tag: "field", name: "PeriodStart", xref: "cluster§9.13.5.2.1",
                    details: "This field shall indicate the beginning timestamp in UTC of the period."
                },
                {
                    tag: "field", name: "PeriodEnd", xref: "cluster§9.13.5.2.2",
                    details: "This field shall indicate the ending timestamp in UTC of the period. This shall be greater than " +
                        "PeriodStart. If this field is null, then the period has no definite end."
                },
                {
                    tag: "field", name: "GridCarbonIntensity", xref: "cluster§9.13.5.2.3",
                    details: "This field shall indicate the estimated carbon intensity in grams of CO2 equivalent per kWh of the " +
                        "grid. This is not impacted by any local generation."
                },

                {
                    tag: "field", name: "GridCarbonLevel", xref: "cluster§9.13.5.2.4",

                    details: "This field shall indicate the relative level of carbon intensity of the grid. This is not impacted " +
                        "by any local generation." +
                        "\n" +
                        "It is up to the cluster server to determine the thresholds of High, Medium or Low based upon typical " +
                        "grid carbon levels for this region or market, since this can vary significantly between countries " +
                        "across the world."
                },

                {
                    tag: "field", name: "LocalCarbonIntensity", xref: "cluster§9.13.5.2.5",

                    details: "This field shall indicate the estimated carbon intensity in grams of CO2 equivalent per kWh of the " +
                        "premises mains supply. This value shall take into account the impact of any local generation." +
                        "\n" +
                        "For example, if an EMS can forecast that excess generation will occur in a period or the premises " +
                        "are currently generating excess power to the grid, then this could assume a value of 0 grams CO2 " +
                        "equivalent per kWh for this period." +
                        "\n" +
                        "When solar PV is not being exported to the grid then this value is typically the same as the " +
                        "GridCarbonIntensity." +
                        "\n" +
                        "Clients are expected to use this value when computing or displaying the local premises carbon " +
                        "intensity to users." +
                        "\n" +
                        "If there is no local generation, this value shall be the same as the GridCarbonIntensity at all " +
                        "times."
                },

                {
                    tag: "field", name: "LocalCarbonLevel", xref: "cluster§9.13.5.2.6",

                    details: "This field shall indicate the relative level of carbon intensity of the premises mains supply. This " +
                        "level shall take into account impact of any local generation." +
                        "\n" +
                        "It is up to the cluster server to determine the thresholds of High, Medium or Low based upon typical " +
                        "grid carbon levels for this region or market, since this can vary significantly between countries " +
                        "across the world." +
                        "\n" +
                        "When local power generation (for example from solar PV) is not being exported to the grid then this " +
                        "level is the same as the GridCarbonLevel." +
                        "\n" +
                        "Clients are expected to use this value when displaying the local premises carbon intensity to users." +
                        "\n" +
                        "If there is no local generation, this value shall be the same as the GridCarbonLevel at all times."
                }
            ]
        }
    ]
});
