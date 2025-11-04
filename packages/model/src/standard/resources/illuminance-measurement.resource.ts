/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "IlluminanceMeasurement", pics: "ILL", xref: "cluster§2.2",
        details: "The Illuminance Measurement cluster provides an interface to illuminance measurement functionality, " +
            "including configuration and provision of notifications of illuminance measurements.",

        children: [
            {
                tag: "attribute", name: "MeasuredValue", xref: "cluster§2.2.5.1",

                details: "Indicates the illuminance in Lux (symbol lx) as follows:" +
                    "\n" +
                    "  • MeasuredValue = 10,000 x log10(illuminance) + 1," +
                    "\n" +
                    "where 1 lx <= illuminance <= 3.576 Mlx, corresponding to a MeasuredValue in the range 1 to 0xFFFE. " +
                    "The MeasuredValue attribute can take the following values:" +
                    "\n" +
                    "  • 0 indicates a value of illuminance that is too low to be measured," +
                    "\n" +
                    "  • MinMeasuredValue <= MeasuredValue <= MaxMeasuredValue under normal circumstances," +
                    "\n" +
                    "  • null indicates that the illuminance measurement is invalid." +
                    "\n" +
                    "The MeasuredValue attribute is updated continuously as new measurements are made."
            },

            {
                tag: "attribute", name: "MinMeasuredValue", xref: "cluster§2.2.5.2",
                details: "Indicates the minimum value of MeasuredValue that can be measured. A value of null indicates that " +
                    "this attribute is not defined. See Measured Value for more details."
            },
            {
                tag: "attribute", name: "MaxMeasuredValue", xref: "cluster§2.2.5.3",
                details: "Indicates the maximum value of MeasuredValue that can be measured. A value of null indicates that " +
                    "this attribute is not defined. See Measured Value for more details."
            },
            { tag: "attribute", name: "Tolerance", xref: "cluster§2.2.5.4", details: "See Measured Value." },
            {
                tag: "attribute", name: "LightSensorType", xref: "cluster§2.2.5.5",
                details: "Indicates the electronic type of the light sensor. This attribute shall be set to one of the " +
                    "non-reserved values listed in LightSensorTypeEnum or null in case the sensor type is unknown."
            },

            {
                tag: "datatype", name: "LightSensorTypeEnum", xref: "cluster§2.2.4.1",
                children: [
                    { tag: "field", name: "Photodiode", description: "Indicates photodiode sensor type" },
                    { tag: "field", name: "Cmos", description: "Indicates CMOS sensor type" }
                ]
            }
        ]
    }
);
