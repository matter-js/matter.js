/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "datatype", name: "temperature", description: "Temperature", xref: "core§7.19.2.9",

        details: "This type represents a temperature on the Celsius scale with a resolution of 0.01°C." +
            "\n" +
            "  - value = (temperature in °C) x 100" +
            "\n" +
            "  - -4°C => -400" +
            "\n" +
            "  - 123.45°C => 12345" +
            "\n" +
            "The range is constrained by absolute zero: -273.15°C to 327.67°C."
    }
);
