/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "PressureMeasurement", classification: "application", pics: "PRS",
        xref: "cluster§2.4",
        details: "This cluster provides an interface to pressure measurement functionality, including configuration " +
            "and provision of notifications of pressure measurements.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§2.4.4",
                children: [{ tag: "field", name: "EXT", details: "Extended range and resolution" }]
            },

            {
                tag: "attribute", name: "MeasuredValue", xref: "cluster§2.4.5.1",
                details: "Indicates the pressure in kPa as follows:" +
                    "\n" +
                    "MeasuredValue = 10 x Pressure [kPa]" +
                    "\n" +
                    "The null value indicates that the value is not available."
            },

            {
                tag: "attribute", name: "MinMeasuredValue", xref: "cluster§2.4.5.2",
                details: "Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more " +
                    "details." +
                    "\n" +
                    "The null value indicates that the value is not available."
            },

            {
                tag: "attribute", name: "MaxMeasuredValue", xref: "cluster§2.4.5.3",
                details: "Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more " +
                    "details." +
                    "\n" +
                    "The null value indicates that the value is not available."
            },

            { tag: "attribute", name: "Tolerance", xref: "cluster§2.4.5.4", details: "See Measured Value." },

            {
                tag: "attribute", name: "ScaledValue", xref: "cluster§2.4.5.5",
                details: "Indicates the pressure in Pascals as follows:" +
                    "\n" +
                    "ScaledValue = 10Scale x Pressure [Pa]" +
                    "\n" +
                    "The null value indicates that the value is not available."
            },

            {
                tag: "attribute", name: "MinScaledValue", xref: "cluster§2.4.5.6",
                details: "Indicates the minimum value of ScaledValue that can be measured. The null value indicates that the " +
                    "value is not available."
            },
            {
                tag: "attribute", name: "MaxScaledValue", xref: "cluster§2.4.5.7",
                details: "Indicates the maximum value of ScaledValue that can be measured. The null value indicates that the " +
                    "value is not available."
            },

            {
                tag: "attribute", name: "ScaledTolerance", xref: "cluster§2.4.5.8",
                details: "Indicates the magnitude of the possible error that is associated with Scaled" +
                    "\n" +
                    "### Value. The true value is located in the range" +
                    "\n" +
                    "(ScaledValue – ScaledTolerance) to (ScaledValue + ScaledTolerance)."
            },

            {
                tag: "attribute", name: "Scale", xref: "cluster§2.4.5.9",
                details: "Indicates the base 10 exponent used to obtain ScaledValue (see ScaledValue)."
            }
        ]
    }
);
