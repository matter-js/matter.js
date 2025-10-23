/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ConcentrationMeasurement", classification: "application", pics: "CONC",
    xref: "cluster§2.10",
    details: "The server cluster provides an interface to concentration measurement functionality. This cluster " +
        "shall to be used via an alias to a specific substance (see Cluster IDs).",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§2.10.4",

            children: [
                { tag: "field", name: "MEA", details: "Cluster supports numeric measurement of substance" },
                {
                    tag: "field", name: "LEV",
                    details: "Cluster supports basic level indication for substance using the ConcentrationLevel enum"
                },
                { tag: "field", name: "MED", details: "Cluster supports the Medium Concentration Level" },
                { tag: "field", name: "CRI", details: "Cluster supports the Critical Concentration Level" },
                { tag: "field", name: "PEA", details: "Cluster supports peak numeric measurement of substance" },
                { tag: "field", name: "AVG", details: "Cluster supports average numeric measurement of substance" }
            ]
        },

        {
            tag: "attribute", name: "MeasuredValue", xref: "cluster§2.10.6.1",
            details: "Indicates the most recent measurement as a single-precision floating-point number. MeasuredValue’s " +
                "unit is represented by MeasurementUnit." +
                "\n" +
                "A value of null indicates that the measurement is unknown or outside the valid range. " +
                "MinMeasuredValue and MaxMeasuredValue define the valid range for MeasuredValue."
        },

        {
            tag: "attribute", name: "MinMeasuredValue", xref: "cluster§2.10.6.2",
            details: "Indicates the minimum value of MeasuredValue that is capable of being measured. A MinMeasuredValue " +
                "of null indicates that the MinMeasuredValue is not defined."
        },
        {
            tag: "attribute", name: "MaxMeasuredValue", xref: "cluster§2.10.6.3",
            details: "Indicates the maximum value of MeasuredValue that is capable of being measured. A MaxMeasuredValue " +
                "of null indicates that the MaxMeasuredValue is not defined."
        },

        {
            tag: "attribute", name: "PeakMeasuredValue", xref: "cluster§2.10.6.4",
            details: "Indicates the maximum value of MeasuredValue that has been measured during the " +
                "PeakMeasuredValueWindow. If this attribute is provided, the PeakMeasuredValueWindow attribute shall " +
                "also be provided."
        },

        {
            tag: "attribute", name: "PeakMeasuredValueWindow", xref: "cluster§2.10.6.5",
            details: "Indicates the window of time used for determining the PeakMeasuredValue. The value is in seconds."
        },

        {
            tag: "attribute", name: "AverageMeasuredValue", xref: "cluster§2.10.6.6",
            details: "Indicates the average value of MeasuredValue that has been measured during the " +
                "AverageMeasuredValueWindow. If this attribute is provided, the AverageMeasuredValueWindow attribute " +
                "shall also be provided."
        },

        {
            tag: "attribute", name: "AverageMeasuredValueWindow", xref: "cluster§2.10.6.7",
            details: "Indicates the window of time used for determining the AverageMeasuredValue. The value is in seconds."
        },
        {
            tag: "attribute", name: "Uncertainty", xref: "cluster§2.10.6.8",
            details: "Indicates the range of error or deviation that can be found in MeasuredValue and PeakMeasuredValue. " +
                "This is considered a +/- value and should be considered to be in MeasurementUnit."
        },
        {
            tag: "attribute", name: "MeasurementUnit", xref: "cluster§2.10.6.9",
            details: "Indicates the unit of MeasuredValue. See MeasurementUnitEnum."
        },
        {
            tag: "attribute", name: "MeasurementMedium", xref: "cluster§2.10.6.10",
            details: "Indicates the medium in which MeasuredValue or LevelValue is being measured. See " +
                "MeasurementMediumEnum."
        },
        {
            tag: "attribute", name: "LevelValue", xref: "cluster§2.10.6.11",
            details: "Indicates the level of the substance detected. See LevelValueEnum."
        },

        {
            tag: "datatype", name: "MeasurementUnitEnum", xref: "cluster§2.10.5.1",
            details: "Where mentioned, Billion refers to 10, Trillion refers to 1012 (short scale).",

            children: [
                { tag: "field", name: "Ppm", description: "Parts per Million (10)" },
                { tag: "field", name: "Ppb", description: "Parts per Billion (10)" },
                { tag: "field", name: "Ppt", description: "Parts per Trillion (1012)" },
                { tag: "field", name: "Mgm3", description: "Milligram per m" },
                { tag: "field", name: "Ugm3", description: "Microgram per m" },
                { tag: "field", name: "Ngm3", description: "Nanogram per m" },
                { tag: "field", name: "Pm3", description: "Particles per m" },
                { tag: "field", name: "Bqm3", description: "Becquerel per m" }
            ]
        },

        {
            tag: "datatype", name: "MeasurementMediumEnum", xref: "cluster§2.10.5.2",
            children: [
                { tag: "field", name: "Air", description: "The measurement is being made in Air" },
                { tag: "field", name: "Water", description: "The measurement is being made in Water" },
                { tag: "field", name: "Soil", description: "The measurement is being made in Soil" }
            ]
        },

        {
            tag: "datatype", name: "LevelValueEnum", xref: "cluster§2.10.5.3",

            children: [
                { tag: "field", name: "Unknown", description: "The level is Unknown" },
                { tag: "field", name: "Low", description: "The level is considered Low" },
                { tag: "field", name: "Medium", description: "The level is considered Medium" },
                { tag: "field", name: "High", description: "The level is considered High" },
                { tag: "field", name: "Critical", description: "The level is considered Critical" }
            ]
        }
    ]
});
