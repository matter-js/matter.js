/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "datatype", name: "temperature", description: "Temperature", xref: "core§7.19.2.9",

        details: "This type represents a temperature on the Celsius scale with a resolution of 0.01°C." +
            "\n" +
            "  • value = (temperature in °C) x 100" +
            "\n" +
            "The range is constrained by absolute zero: -273.15°C to 327.67°C." +
            "\n" +
            "### Conversion of Temperature Values for Display" +
            "\n" +
            "When converting temperature values for display manufacturers SHOULD ensure that calculations round " +
            "to the nearest representable value. Particular care is needed when using integer arithmetic." +
            "\n" +
            "### Sample Conversion Code" +
            "\n" +
            "Sample code provided to ensure consistent Fahrenheit to Celsius and vice-versa conversion between " +
            "devices and across vendors." +
            "\n" +
            "For degF: the value is a int8u representing 2x temperature value in Fahrenheit (to get 0.5 " +
            "resolution)." +
            "\n" +
            "For degC: the value is a int16s representing Celsius in 0.01 resolution as expected by the Matter " +
            "format."
    }
);
