/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "SoilSensor", xref: "device§7.14",

    details: "A Soil Sensor device reports measurements of soil values, such as moisture and (optionally) " +
        "temperature." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "#### Identify Cluster" +
        "\n" +
        "This is used to identify the endpoint." +
        "\n" +
        "#### Temperature Measurement Cluster" +
        "\n" +
        "This is used to provide the temperature of the soil. Measurements SHOULD be done either in the soil " +
        "or very close to the soil, in order to NOT provide ambient temperature measurements." +
        "\n" +
        "#### Soil Measurement Cluster" +
        "\n" +
        "This is used to provide the humidity of the soil.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§7.14.4" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§7.14.4" },
        { tag: "requirement", name: "SoilMeasurement", xref: "device§7.14.4" }
    ]
});
