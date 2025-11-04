/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "TemperatureMeasurement", pics: "TMP", xref: "cluster§2.3",
    details: "This cluster provides an interface to temperature measurement functionality, including configuration " +
        "and provision of notifications of temperature measurements.",

    children: [
        {
            tag: "attribute", name: "MeasuredValue", xref: "cluster§2.3.4.1",
            details: "Indicates the measured temperature. The null value indicates that the temperature is unknown."
        },

        {
            tag: "attribute", name: "MinMeasuredValue", xref: "cluster§2.3.4.2",
            details: "Indicates the minimum value of MeasuredValue that is capable of being measured. See Measured Value " +
                "for more details." +
                "\n" +
                "The null value indicates that the value is not available."
        },

        {
            tag: "attribute", name: "MaxMeasuredValue", xref: "cluster§2.3.4.3",
            details: "This attribute indicates the maximum value of MeasuredValue that is capable of being measured. See " +
                "Measured Value for more details." +
                "\n" +
                "The null value indicates that the value is not available."
        },

        { tag: "attribute", name: "Tolerance", xref: "cluster§2.3.4.4", details: "See Measured Value." }
    ]
});
