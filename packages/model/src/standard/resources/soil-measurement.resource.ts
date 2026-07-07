/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "SoilMeasurement", pics: "SOIL", xref: "cluster§2.15",
    details: "This cluster provides an interface to soil measurement functionality, including configuration and " +
        "provision of notifications of soil measurements.",

    children: [
        {
            tag: "attribute", name: "SoilMoistureMeasurementLimits", xref: "cluster§2.15.4.1",

            details: "Indicates the limits for the SoilMoistureMeasuredValue attribute." +
                "\n" +
                "Given the measurements are in percentage, the MinMeasuredValue field in the " +
                "SoilMoistureMeasurementLimits attribute shall NOT be less than 0 and shall NOT be greater than 99. " +
                "The MaxMeasuredValue field in the SoilMoistureMeasurementLimits attribute shall NOT be less than " +
                "(SoilMoistureMinMeasurableValue + 1) and shall NOT be greater than 100. The MeasurementType field " +
                "value shall be set to SoilMoisture." +
                "\n" +
                "There shall only be a single entry in the AccuracyRanges list of the SoilMoistureMeasurementLimits " +
                "attribute. The entry shall cover the full measurement range, meaning that the value of the RangeMin " +
                "field shall be equal to the value of the MinMeasuredValue field and the value of the RangeMax field " +
                "shall be equal to the value of the MaxMeasuredValue field. The entry shall only indicate a " +
                "PercentMax value and the value shall NOT be greater than 10.00 percent."
        },

        {
            tag: "attribute", name: "SoilMoistureMeasuredValue", xref: "cluster§2.15.4.2",
            details: "Indicates the water content of the soil in percentage." +
                "\n" +
                "The null value indicates that the measurement is unknown e.g. no measurement has been performed yet."
        }
    ]
});
