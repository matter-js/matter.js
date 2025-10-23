/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "MeasurementAccuracyStruct", xref: "cluster§2.1.3.3",
    details: "This struct represents the set of accuracy ranges for a given measurement, the maximum and minimum " +
        "values for the measurement, and whether the measurement is directly measured or just estimated from " +
        "other information.",

    children: [
        {
            tag: "field", name: "MeasurementType", xref: "cluster§2.1.3.3.1",
            details: "This field shall indicate the type of measurement for the accuracy provided."
        },
        {
            tag: "field", name: "Measured", xref: "cluster§2.1.3.3.2",
            details: "This field shall indicate whether the associated measurement was directly measured. If this field is " +
                "not set to true, then the associated measurement was estimated."
        },

        {
            tag: "field", name: "AccuracyRanges", xref: "cluster§2.1.3.3.5",

            details: "This field shall indicate a list of measurement ranges and their associated accuracies." +
                "\n" +
                "The value of the RangeMin field on the first MeasurementAccuracyRangeStruct in this list shall be " +
                "equal to the value of the MinMeasuredValue field." +
                "\n" +
                "The value of the RangeMax field on the last MeasurementAccuracyRangeStruct in this list shall be " +
                "less than or equal to the value of the MaxMeasuredValue field." +
                "\n" +
                "The value of the RangeMin field on each MeasurementAccuracyRangeStruct in this list other than the " +
                "first shall be one more the value of the RangeMax field on the previous " +
                "MeasurementAccuracyRangeStruct in this list (i.e. there shall be no gaps in the accuracy ranges, and " +
                "the ranges shall be in increasing order)."
        }
    ]
});
