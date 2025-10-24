/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "MeasurementAccuracyRangeStruct", xref: "cluster§2.1.3.2",

    details: "This struct represents the accuracy of a measurement for a range of measurement values. Accuracy " +
        "shall be expressed as a maximum +/- percentage of the true value, a maximum +/- fixed value of the " +
        "true value, or both." +
        "\n" +
        "  • If both PercentMax and FixedMax are indicated, then for a given true value in the range between " +
        "    RangeMin and RangeMax," +
        "\n" +
        "    ◦ the reported value shall be less than or equal to the sum of the true value, FixedMax and " +
        "      PercentMax percent of the true value." +
        "\n" +
        "    ◦ the reported value shall be greater than or equal to the true value minus the sum of FixedMax " +
        "      and PercentMax percent of the true value." +
        "\n" +
        "  • If only PercentMax is indicated, then for a given true value in the range between RangeMin and " +
        "    RangeMax," +
        "\n" +
        "    ◦ the reported value shall be less than or equal to the sum of the true value and PercentMax " +
        "      percent of the true value." +
        "\n" +
        "    ◦ the reported value shall be greater than or equal to the true value minus PercentMax percent " +
        "      of the true value." +
        "\n" +
        "  • If only FixedMax is indicated, then for a given true value in the range between RangeMin and " +
        "    RangeMax," +
        "\n" +
        "    ◦ the reported value shall be less than or equal to the sum of the true value and FixedMax." +
        "\n" +
        "    ◦ the reported value shall be greater than or equal to the true value minus FixedMax.",

    children: [
        {
            tag: "field", name: "RangeMin", xref: "cluster§2.1.3.2.1",

            details: "This field shall indicate the minimum measurement value for the specified level of accuracy." +
                "\n" +
                "The value of this field shall be greater than or equal to the value of the MinMeasuredValue field on " +
                "the encompassing MeasurementAccuracyStruct." +
                "\n" +
                "The value of this field shall be less than or equal to the value of the MaxMeasuredValue field on " +
                "the encompassing MeasurementAccuracyStruct."
        },

        {
            tag: "field", name: "RangeMax", xref: "cluster§2.1.3.2.2",

            details: "This field shall indicate the maximum measurement value for the specified level of accuracy. The " +
                "value of this field shall be greater than the value of the RangeMin field." +
                "\n" +
                "The value of this field shall be greater than or equal to the value of the MinMeasuredValue field on " +
                "the encompassing MeasurementAccuracyStruct." +
                "\n" +
                "The value of this field shall be less than or equal to the value of the MaxMeasuredValue field on " +
                "the encompassing MeasurementAccuracyStruct."
        },

        {
            tag: "field", name: "PercentMax", xref: "cluster§2.1.3.2.3",
            details: "This field shall indicate the maximum +/- percentage accuracy for the associated measurement."
        },
        {
            tag: "field", name: "PercentMin", xref: "cluster§2.1.3.2.4",
            details: "This field shall indicate the minimum +/- percentage accuracy for the associated measurement."
        },
        {
            tag: "field", name: "PercentTypical", xref: "cluster§2.1.3.2.5",
            details: "This field shall indicate the typical +/- percentage accuracy for the associated measurement."
        },
        {
            tag: "field", name: "FixedMax", xref: "cluster§2.1.3.2.6",
            details: "This field shall indicate the maximum +/- fixed accuracy for the associated measurement, in the unit " +
                "indicated by MeasurementType."
        },
        {
            tag: "field", name: "FixedMin", xref: "cluster§2.1.3.2.7",
            details: "This field shall indicate the minimum +/- fixed accuracy for the associated measurement, in the unit " +
                "indicated by MeasurementType."
        },
        {
            tag: "field", name: "FixedTypical", xref: "cluster§2.1.3.2.8",
            details: "This field shall indicate the typical +/- fixed accuracy for the associated measurement, in the unit " +
                "indicated by MeasurementType."
        }
    ]
});
