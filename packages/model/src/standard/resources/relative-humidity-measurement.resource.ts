/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "RelativeHumidityMeasurement", pics: "RH", xref: "cluster§2.6",
        details: "This is a base cluster. The server cluster provides an interface to water content measurement " +
            "functionality. The measurement is reportable and may be configured for reporting. Water content " +
            "measurements currently is, but are not limited to relative humidity.",

        children: [
            {
                tag: "attribute", name: "MeasuredValue", xref: "cluster§2.6.4.1",

                details: "MeasuredValue represents the water content in % as follows:" +
                    "\n" +
                    "MeasuredValue = 100 x water content" +
                    "\n" +
                    "Where 0% < = water content < = 100%, corresponding to a MeasuredValue in the range 0 to 10000. The " +
                    "maximum resolution this format allows is 0.01%." +
                    "\n" +
                    "MinMeasuredValue and MaxMeasuredValue define the range of the sensor." +
                    "\n" +
                    "The null value indicates that the measurement is unknown, otherwise the range shall be as described " +
                    "in Measured Value." +
                    "\n" +
                    "MeasuredValue is updated continuously as new measurements are made."
            },

            {
                tag: "attribute", name: "MinMeasuredValue", xref: "cluster§2.6.4.2",
                details: "The MinMeasuredValue attribute indicates the minimum value of MeasuredValue that can be measured. " +
                    "The null value means this attribute is not defined. See Measured Value for more details."
            },
            {
                tag: "attribute", name: "MaxMeasuredValue", xref: "cluster§2.6.4.3",
                details: "The MaxMeasuredValue attribute indicates the maximum value of MeasuredValue that can be measured. " +
                    "The null value means this attribute is not defined. See Measured Value for more details."
            },
            { tag: "attribute", name: "Tolerance", xref: "cluster§2.6.4.4", details: "See Measured Value." }
        ]
    }
);
