/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "FlowMeasurement", pics: "FLW", xref: "cluster§2.5",
        details: "This cluster provides an interface to flow measurement functionality, including configuration and " +
            "provision of notifications of flow measurements.",

        children: [
            {
                tag: "attribute", name: "MeasuredValue", xref: "cluster§2.5.4.1",

                details: "Indicates the flow in m/h as follows:" +
                    "\n" +
                    "MeasuredValue = 10 x Flow" +
                    "\n" +
                    "The null value indicates that the flow measurement is unknown, otherwise the range shall be as " +
                    "described in Measured Value."
            },

            {
                tag: "attribute", name: "MinMeasuredValue", xref: "cluster§2.5.4.2",
                details: "Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more " +
                    "details." +
                    "\n" +
                    "The null value indicates that the value is not available."
            },

            {
                tag: "attribute", name: "MaxMeasuredValue", xref: "cluster§2.5.4.3",
                details: "Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more " +
                    "details." +
                    "\n" +
                    "The null value indicates that the value is not available."
            },

            { tag: "attribute", name: "Tolerance", xref: "cluster§2.5.4.4", details: "See Measured Value." }
        ]
    }
);
