/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "AirQualitySensor", xref: "device§7.10",
    details: "This defines conformance for the Air Quality Sensor device type." +
        "\n" +
        "An air quality sensor is a device designed to monitor and measure various parameters related to the " +
        "quality of ambient air in indoor or outdoor environments.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.10.4" },
        { tag: "requirement", name: "AirQuality", xref: "device§7.10.4" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "RelativeHumidityMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "CarbonMonoxideConcentrationMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "CarbonDioxideConcentrationMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "NitrogenDioxideConcentrationMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "OzoneConcentrationMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "FormaldehydeConcentrationMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "Pm1ConcentrationMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "Pm25ConcentrationMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "Pm10ConcentrationMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "RadonConcentrationMeasurement", xref: "device§7.10.4" },
        { tag: "requirement", name: "TotalVolatileOrganicCompoundsConcentrationMeasurement", xref: "device§7.10.4" }
    ]
});
